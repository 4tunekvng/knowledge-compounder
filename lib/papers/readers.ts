import "server-only";
import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { dailyPicks, papers, readerEvents, readerProfiles } from "@/lib/db/schema";
import { dayStart } from "./harvest";
import {
  applyFeedback,
  buildIndex,
  feedbackTerms,
  pickDaily,
  type ProfileTerm,
  rankPapers,
  type Ranked,
  textTerms,
} from "./rank";

/**
 * Everything one person's paper picks read or write. Every function takes the
 * person's id (fortuneking-auth's user.id, stored as owner_id) as its first
 * argument and only touches rows with that id, so nobody reaches another's.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const PICKS_SHOWN = 3;
const PICKS_STORED = 20;
// arXiv posts nothing on weekends, so 4 calendar days hold 3 announcement days.
const POOL_DAYS = 4;
const ACTIVE_DAYS = 30;
const FEEDBACK_STEP = 0.3;
const FEEDBACK_TERMS_PER_CLICK = 3;

export type EventKind = "more" | "less" | "save" | "open";

const readingDay = (now: number) =>
  new Date(dayStart(now)).toISOString().slice(0, 10);

export interface Profile {
  interestsText: string;
  terms: ProfileTerm[];
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(readerProfiles)
    .where(eq(readerProfiles.ownerId, userId));
  return row
    ? { interestsText: row.interestsText, terms: JSON.parse(row.terms) }
    : null;
}

async function poolSince(since: number) {
  const db = await getDb();
  return db
    .select({
      arxivId: papers.arxivId,
      title: papers.title,
      abstract: papers.abstract,
      hfUpvotes: papers.hfUpvotes,
    })
    .from(papers)
    .where(gte(papers.harvestedAt, new Date(since)));
}

async function storePicks(userId: string, day: string, ranked: Ranked[]) {
  const db = await getDb();
  await db
    .delete(dailyPicks)
    .where(and(eq(dailyPicks.ownerId, userId), eq(dailyPicks.day, day)));
  const rows = ranked.slice(0, PICKS_STORED).map((r, i) => ({
    ownerId: userId,
    day,
    rank: i + 1,
    arxivId: r.arxivId,
    score: r.score,
    // Strongest first, so the page can tell picks led by the same term apart.
    matched: JSON.stringify([
      r.strongest,
      ...r.matched.filter((m) => m !== r.strongest),
    ]),
  }));
  // 6 columns a row: 16 rows stay under D1's 100 bound values per statement.
  for (let i = 0; i < rows.length; i += 16) {
    await db.insert(dailyPicks).values(rows.slice(i, i + 16));
  }
}

/** Rank the last few days' papers for one member and store today's top 20. */
export async function rankMember(userId: string, now: number = Date.now()) {
  const profile = await getProfile(userId);
  if (!profile) return;
  const pool = await poolSince(now - POOL_DAYS * DAY_MS);
  const ranked = rankPapers(buildIndex(pool), profile.terms);
  await storePicks(userId, readingDay(now), ranked);
}

/** Save interest text; the member gets picks from it at once. */
export async function saveInterests(
  userId: string,
  interestsText: string,
  now: number = Date.now(),
): Promise<void> {
  const db = await getDb();
  const previous = await getProfile(userId);
  const feedback = previous?.terms.filter((t) => t.source === "feedback") ?? [];
  const terms = [...textTerms(interestsText), ...feedback];
  await db
    .insert(readerProfiles)
    .values({
      ownerId: userId,
      interestsText,
      terms: JSON.stringify(terms),
      lastSeenAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: readerProfiles.ownerId,
      set: {
        interestsText,
        terms: JSON.stringify(terms),
        lastSeenAt: new Date(now),
      },
    });
  await rankMember(userId, now);
}

export interface Pick {
  arxivId: string;
  title: string;
  summary: string;
  matched: string[];
  githubUrl: string | null;
  hfUpvotes: number | null;
}

function firstSentences(text: string, n: number): string {
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [text];
  return sentences.slice(0, n).join("").trim();
}

/**
 * Today's 3 picks: from the newest stored list, leaving out papers shown on an
 * earlier day or marked "less". The same 3 come back all day. A member with
 * no list for the last few days is ranked now.
 */
export async function todaysPicks(
  userId: string,
  now: number = Date.now(),
): Promise<Pick[]> {
  const db = await getDb();
  const today = readingDay(now);
  await db
    .update(readerProfiles)
    .set({ lastSeenAt: new Date(now) })
    .where(eq(readerProfiles.ownerId, userId));

  const since = readingDay(now - (POOL_DAYS - 1) * DAY_MS);
  let [latest] = await db
    .select({ day: dailyPicks.day })
    .from(dailyPicks)
    .where(and(eq(dailyPicks.ownerId, userId), gte(dailyPicks.day, since)))
    .orderBy(desc(dailyPicks.day))
    .limit(1);
  if (!latest) {
    await rankMember(userId, now);
    latest = { day: today };
  }
  const stored = await db
    .select()
    .from(dailyPicks)
    .where(and(eq(dailyPicks.ownerId, userId), eq(dailyPicks.day, latest.day)))
    .orderBy(dailyPicks.rank);

  const hidden = await db
    .select({ arxivId: readerEvents.arxivId })
    .from(readerEvents)
    .where(
      and(
        eq(readerEvents.ownerId, userId),
        or(
          eq(readerEvents.kind, "less"),
          and(
            eq(readerEvents.kind, "shown"),
            lt(readerEvents.createdAt, new Date(dayStart(now))),
          ),
        ),
      ),
    );
  const hide = new Set(hidden.map((h) => h.arxivId));
  const candidates: Ranked[] = stored
    .filter((s) => !hide.has(s.arxivId))
    .map((s) => {
      const matched: string[] = JSON.parse(s.matched);
      return {
        arxivId: s.arxivId,
        score: s.score,
        relevance: s.score,
        matched,
        strongest: matched[0],
      };
    });
  const chosen = pickDaily(candidates, PICKS_SHOWN);
  if (chosen.length === 0) return [];

  const ids = chosen.map((c) => c.arxivId);
  const shownToday = await db
    .select({ arxivId: readerEvents.arxivId })
    .from(readerEvents)
    .where(
      and(
        eq(readerEvents.ownerId, userId),
        eq(readerEvents.kind, "shown"),
        inArray(readerEvents.arxivId, ids),
      ),
    );
  const already = new Set(shownToday.map((s) => s.arxivId));
  const fresh = ids.filter((id) => !already.has(id));
  if (fresh.length) {
    await db.insert(readerEvents).values(
      fresh.map((arxivId) => ({
        ownerId: userId,
        arxivId,
        kind: "shown" as const,
      })),
    );
  }

  const rows = await db.select().from(papers).where(inArray(papers.arxivId, ids));
  const byId = new Map(rows.map((r) => [r.arxivId, r]));
  return chosen.flatMap((c) => {
    const p = byId.get(c.arxivId);
    if (!p) return [];
    return [
      {
        arxivId: p.arxivId,
        title: p.title,
        summary: p.hfSummary ?? firstSentences(p.abstract, 2),
        matched: c.matched,
        githubUrl: p.githubUrl,
        hfUpvotes: p.hfUpvotes,
      },
    ];
  });
}

/** Record a click; "more", "less" and "save" also teach the member's terms. */
export async function recordEvent(
  userId: string,
  arxivId: string,
  kind: EventKind,
  now: number = Date.now(),
): Promise<void> {
  const db = await getDb();
  await db
    .insert(readerEvents)
    .values({ ownerId: userId, arxivId, kind, createdAt: new Date(now) });
  if (kind === "open") return;
  const profile = await getProfile(userId);
  if (!profile) return;
  const pool = await poolSince(now - POOL_DAYS * DAY_MS);
  const index = buildIndex(pool);
  const grams = feedbackTerms(
    index,
    arxivId,
    profile.terms,
    FEEDBACK_TERMS_PER_CLICK,
  );
  const delta = kind === "less" ? -FEEDBACK_STEP : FEEDBACK_STEP;
  const terms = applyFeedback(profile.terms, grams, delta);
  await db
    .update(readerProfiles)
    .set({ terms: JSON.stringify(terms) })
    .where(eq(readerProfiles.ownerId, userId));
}

/** The cron's share: members seen in the last 30 days with no list today. */
export async function rankActiveMembers(
  now: number,
  limit: number,
): Promise<number> {
  const db = await getDb();
  const today = readingDay(now);
  const active = await db
    .select({ userId: readerProfiles.ownerId })
    .from(readerProfiles)
    .where(gte(readerProfiles.lastSeenAt, new Date(now - ACTIVE_DAYS * DAY_MS)));
  const done = await db
    .selectDistinct({ userId: dailyPicks.ownerId })
    .from(dailyPicks)
    .where(eq(dailyPicks.day, today));
  const doneIds = new Set(done.map((d) => d.userId));
  const due = active.filter((a) => !doneIds.has(a.userId)).slice(0, limit);
  if (due.length === 0) return 0;
  const pool = await poolSince(now - POOL_DAYS * DAY_MS);
  const index = buildIndex(pool);
  for (const { userId } of due) {
    const profile = await getProfile(userId);
    if (profile) await storePicks(userId, today, rankPapers(index, profile.terms));
  }
  return due.length;
}

/** "Delete my reading data": profile, clicks and picks. */
export async function deleteReadingData(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(readerProfiles).where(eq(readerProfiles.ownerId, userId));
  await db.delete(readerEvents).where(eq(readerEvents.ownerId, userId));
  await db.delete(dailyPicks).where(eq(dailyPicks.ownerId, userId));
}
