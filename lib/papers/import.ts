import type { HarvestedPaper } from "./feeds";
import { textTerms } from "./rank";

/**
 * SQL that brings someone's existing reading into paper picks: their
 * interests (only if they have no profile yet, so nothing they set in the
 * app is overwritten), papers they saved, papers they read before (counted
 * as "more"), and the papers those refer to. Re-running it adds nothing
 * twice. Used by scripts/import-reading.mts; the output runs with
 * `wrangler d1 execute --file`.
 */

export interface ReadingImport {
  ownerId: string;
  interests: string;
  saved: string[]; // arXiv ids
  read: string[]; // arXiv ids
  papers: HarvestedPaper[]; // records for those ids, plus any backfill
  now: number;
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const num = (n: number | null) => (n === null ? "NULL" : String(Math.trunc(n)));

export function paperUpsertSql(p: HarvestedPaper): string {
  // harvested_at is the paper's own date, so an old paper never shows up
  // in anyone's "last few days" pool.
  return (
    "INSERT INTO papers (arxiv_id, title, authors, abstract, categories, " +
    "published_at, hf_upvotes, hf_summary, github_url, harvested_at) VALUES (" +
    [
      q(p.arxivId),
      q(p.title),
      q(JSON.stringify(p.authors)),
      q(p.abstract),
      q(JSON.stringify(p.categories)),
      num(p.publishedAt),
      num(p.hfUpvotes),
      p.hfSummary === null ? "NULL" : q(p.hfSummary),
      p.githubUrl === null ? "NULL" : q(p.githubUrl),
      num(p.publishedAt),
    ].join(", ") +
    ") ON CONFLICT(arxiv_id) DO UPDATE SET " +
    "hf_upvotes = coalesce(excluded.hf_upvotes, papers.hf_upvotes), " +
    "hf_summary = coalesce(excluded.hf_summary, papers.hf_summary), " +
    "github_url = coalesce(excluded.github_url, papers.github_url);"
  );
}

function eventSql(ownerId: string, arxivId: string, kind: string, at: number) {
  return (
    "INSERT INTO reader_events (owner_id, arxiv_id, kind, created_at) " +
    `SELECT ${q(ownerId)}, ${q(arxivId)}, ${q(kind)}, ${at} WHERE NOT EXISTS ` +
    `(SELECT 1 FROM reader_events WHERE owner_id = ${q(ownerId)} ` +
    `AND arxiv_id = ${q(arxivId)} AND kind = ${q(kind)});`
  );
}

export function buildImportSql(input: ReadingImport): string {
  const { ownerId, now } = input;
  if (!ownerId) throw new Error("An owner id is required.");
  const lines = input.papers.map(paperUpsertSql);
  if (input.interests.trim()) {
    lines.push(
      "INSERT INTO reader_profiles (owner_id, interests_text, terms, " +
        "last_seen_at) VALUES (" +
        [
          q(ownerId),
          q(input.interests.trim()),
          q(JSON.stringify(textTerms(input.interests))),
          now,
        ].join(", ") +
        ") ON CONFLICT(owner_id) DO NOTHING;",
    );
  }
  for (const id of new Set(input.saved))
    lines.push(eventSql(ownerId, id, "save", now));
  for (const id of new Set(input.read)) {
    lines.push(eventSql(ownerId, id, "imported", now));
  }
  return lines.join("\n") + "\n";
}

const ARXIV_LINK = /arxiv\.org\/(?:abs|pdf|html)\/(\d{4}\.\d{4,5})/g;

/** Every arXiv id linked in a text, in order, once each. */
export function arxivIdsIn(text: string): string[] {
  return [...new Set([...text.matchAll(ARXIV_LINK)].map((m) => m[1]))];
}
