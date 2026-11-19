import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { D1_MAX_BOUND_PARAMS } from "@/lib/db/chunk";
import { paperHarvests, papers } from "@/lib/db/schema";
import { type HarvestedPaper, parseArxivRss, parseHfDaily } from "./feeds";

/**
 * Fill the shared paper pool. The cron calls this every 5 minutes; it does
 * real work only once per reading day (see dayStart) and then when the last
 * harvest is HARVEST_EVERY_MS old, because arXiv posts its feed once a day
 * and Hugging Face's list only gains papers and upvotes through the day.
 */

export const ARXIV_CATEGORIES = [
  "cs.LG",
  "cs.AI",
  "cs.CL",
  "cs.CV",
  "cs.RO",
  "stat.ML",
] as const;

export const HARVEST_EVERY_MS = 3 * 60 * 60 * 1000;
// arXiv's feed items are dated midnight US Eastern: 05:00 UTC in winter,
// 04:00 UTC in summer. A reading day starting at 05:00 UTC is after both.
const DAY_STARTS_AT_UTC_HOUR = 5;
const FETCH_TIMEOUT_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;
// Columns written per row: everything but harvested_at (its default).
const COLUMNS_PER_ROW = 9;
const ROWS_PER_INSERT = Math.floor(D1_MAX_BOUND_PARAMS / COLUMNS_PER_ROW);

export interface HarvestSummary {
  papersSeen: number;
  failedSources: string[];
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchText(fetchImpl: Fetch, url: string): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { "user-agent": "knowledge-compounder paper picks" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.text();
}

/** When the reading day that contains `now` began. */
export function dayStart(now: number): number {
  const start = new Date(now);
  start.setUTCHours(DAY_STARTS_AT_UTC_HOUR, 0, 0, 0);
  return start.getTime() > now ? start.getTime() - DAY_MS : start.getTime();
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Join the same paper from several feeds into one row. */
export function mergeHarvested(found: HarvestedPaper[]): HarvestedPaper[] {
  const byId = new Map<string, HarvestedPaper>();
  for (const paper of found) {
    const seen = byId.get(paper.arxivId);
    if (!seen) {
      byId.set(paper.arxivId, { ...paper });
      continue;
    }
    const fromArxiv = seen.source === "arxiv" ? seen : paper;
    byId.set(paper.arxivId, {
      ...fromArxiv,
      categories: [...new Set([...seen.categories, ...paper.categories])],
      hfUpvotes: seen.hfUpvotes ?? paper.hfUpvotes,
      hfSummary: seen.hfSummary ?? paper.hfSummary,
      githubUrl: seen.githubUrl ?? paper.githubUrl,
    });
  }
  return [...byId.values()];
}

async function collect(
  fetchImpl: Fetch,
  now: number,
): Promise<{ found: HarvestedPaper[]; failedSources: string[] }> {
  const found: HarvestedPaper[] = [];
  const failedSources: string[] = [];
  // One request at a time: arXiv asks automated clients not to burst.
  for (const category of ARXIV_CATEGORIES) {
    try {
      const xml = await fetchText(
        fetchImpl,
        `https://rss.arxiv.org/rss/${category}`,
      );
      found.push(...parseArxivRss(xml));
    } catch {
      failedSources.push(`arxiv:${category}`);
    }
  }
  // Yesterday's list is final; today's is still filling.
  for (const day of [utcDate(now - DAY_MS), utcDate(now)]) {
    const url = `https://huggingface.co/api/daily_papers?date=${day}&limit=100`;
    try {
      found.push(...parseHfDaily(JSON.parse(await fetchText(fetchImpl, url))));
    } catch {
      failedSources.push(`hf:${day}`);
    }
  }
  return { found, failedSources };
}

export async function harvestIfDue(
  now: number = Date.now(),
  fetchImpl: Fetch = fetch,
): Promise<HarvestSummary | null> {
  const db = await getDb();
  const [last] = await db
    .select({ startedAt: paperHarvests.startedAt })
    .from(paperHarvests)
    .orderBy(desc(paperHarvests.startedAt))
    .limit(1);
  if (last) {
    const lastAt = last.startedAt.getTime();
    const fresh = now - lastAt < HARVEST_EVERY_MS;
    if (fresh && lastAt >= dayStart(now)) return null;
  }

  // Log the run before any work, so a run that dies partway still counts and
  // the next tick does not fetch the feeds again five minutes later.
  const [run] = await db
    .insert(paperHarvests)
    .values({ startedAt: new Date(now), papersSeen: 0, failedSources: "[]" })
    .returning({ id: paperHarvests.id });

  const { found, failedSources } = await collect(fetchImpl, now);
  const rows = mergeHarvested(found).map((p) => ({
    arxivId: p.arxivId,
    title: p.title,
    authors: JSON.stringify(p.authors),
    abstract: p.abstract,
    categories: JSON.stringify(p.categories),
    publishedAt: new Date(p.publishedAt),
    hfUpvotes: p.hfUpvotes,
    hfSummary: p.hfSummary,
    githubUrl: p.githubUrl,
  }));
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    await db
      .insert(papers)
      .values(rows.slice(i, i + ROWS_PER_INSERT))
      .onConflictDoUpdate({
        target: papers.arxivId,
        // A later feed can add upvotes, a code link or more categories but
        // never erase what an earlier one found.
        set: {
          hfUpvotes: sql`coalesce(excluded.hf_upvotes, ${papers.hfUpvotes})`,
          hfSummary: sql`coalesce(excluded.hf_summary, ${papers.hfSummary})`,
          githubUrl: sql`coalesce(excluded.github_url, ${papers.githubUrl})`,
          categories: sql`case when excluded.categories = '[]'
            then ${papers.categories} else excluded.categories end`,
        },
      });
  }
  await db
    .update(paperHarvests)
    .set({ papersSeen: rows.length, failedSources: JSON.stringify(failedSources) })
    .where(eq(paperHarvests.id, run.id));
  return { papersSeen: rows.length, failedSources };
}
