-- Paper picks, part 1: the shared pool of new machine-learning papers.
-- Filled by the cron from arXiv's daily feeds and Hugging Face's daily list
-- (lib/papers/harvest.ts). Holds no personal data: every person's picks are
-- ranked from this one pool.
--
-- Mirrors lib/db/schema.ts. Apply with:
--   wrangler d1 migrations apply knowledge-compounder --remote

CREATE TABLE IF NOT EXISTS papers (
  arxiv_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT NOT NULL,
  abstract TEXT NOT NULL,
  categories TEXT NOT NULL,
  published_at INTEGER NOT NULL,
  hf_upvotes INTEGER,
  hf_summary TEXT,
  github_url TEXT,
  harvested_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS papers_published_idx ON papers(published_at);

-- One row per harvest run, so the cron harvests a few times a day instead of
-- every 5 minutes, and so a failing source shows up in the data.
CREATE TABLE IF NOT EXISTS paper_harvests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  papers_seen INTEGER NOT NULL,
  failed_sources TEXT NOT NULL
);
