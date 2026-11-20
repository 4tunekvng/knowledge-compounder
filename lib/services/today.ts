import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sources } from "@/lib/db/schema";
import { todaysPicks } from "@/lib/papers/readers";
import { countDueCards } from "@/lib/services/queries";

/**
 * What the Today page at https://fortuneking.dev shows for this person
 * (contract: fortuneking-auth README, "The Today page"): the cards due for
 * review now, today's paper picks, then the newest capture while it is
 * still being read or was finished since about this time yesterday.
 *
 * No AI calls. The only writes are the paper picks' own: todaysPicks
 * records the three as shown (the Today page does show them) and, for
 * someone with no list in the last few days, ranks one first.
 */

export interface TodayItem {
  title: string;
  detail?: string;
  href: string;
  due?: string;
}

export interface Today {
  app: "knowledge-compounder";
  summary: string;
  items: TodayItem[];
}

/** The contract's cap on items. */
const MAX_ITEMS = 5;

/** "Just done" means since this time yesterday: the Today page is a daily
 *  screen, so a capture finished after the last visit still counts as news. */
const RECENT_MS = 24 * 60 * 60 * 1000;

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

async function newestCapture(ownerId: string, now: Date): Promise<TodayItem | null> {
  const db = await getDb();
  const row = await db
    .select({
      id: sources.id,
      title: sources.title,
      status: sources.status,
      processedAt: sources.processedAt,
      createdAt: sources.createdAt,
    })
    .from(sources)
    .where(eq(sources.ownerId, ownerId))
    .orderBy(desc(sources.createdAt), desc(sources.id))
    .limit(1)
    .get();
  if (!row) return null;
  const href = `/sources/${row.id}`;
  if (row.status === "pending") {
    return { title: row.title, detail: "Still being read", href };
  }
  const finishedAt = (row.processedAt ?? row.createdAt).getTime();
  if (now.getTime() - finishedAt > RECENT_MS) return null;
  const detail =
    row.status === "processed"
      ? "Ready: cards made"
      : "Couldn't be read. Open it to retry";
  return { title: row.title, detail, href };
}

/** Today's picks as items; a failure here never hides the cards. */
async function pickItems(ownerId: string, now: Date): Promise<TodayItem[]> {
  try {
    const picks = await todaysPicks(ownerId, now.getTime());
    return picks.map((pick) => ({
      title: pick.title,
      detail: `Matches ${pick.matched.join(", ")}`,
      href: "/papers",
    }));
  } catch (err) {
    console.error("[today] paper picks failed:", err);
    return [];
  }
}

function summaryOf(due: number, picks: number): string {
  if (due === 0 && picks === 0) return "No cards due. Nice.";
  const cards = due > 0 ? `${plural(due, "card")} due` : "No cards due";
  return picks > 0 ? `${cards} · ${plural(picks, "paper")} picked` : cards;
}

export async function todayFor(ownerId: string, now = new Date()): Promise<Today> {
  const [due, picks, capture] = await Promise.all([
    countDueCards(ownerId, now),
    pickItems(ownerId, now),
    newestCapture(ownerId, now),
  ]);
  const items: TodayItem[] = [];
  if (due > 0) {
    items.push({ title: `Review ${plural(due, "card")}`, href: "/review" });
  }
  items.push(...picks);
  if (capture) items.push(capture);
  return {
    app: "knowledge-compounder",
    summary: summaryOf(due, picks.length),
    items: items.slice(0, MAX_ITEMS),
  };
}
