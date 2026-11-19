-- Paper picks, part 2: each person's interests, clicks and picks. Every row
-- is keyed by owner_id, the Google account id fortuneking-auth's /session
-- returns, like every other table since 0005_owners. Reads and writes go
-- through lib/papers/readers.ts, which takes the owner id as a required
-- argument.
--
-- Mirrors lib/db/schema.ts. Apply with:
--   wrangler d1 migrations apply knowledge-compounder --remote -c wrangler.jsonc

CREATE TABLE IF NOT EXISTS reader_profiles (
  owner_id TEXT PRIMARY KEY,
  interests_text TEXT NOT NULL,
  terms TEXT NOT NULL,
  compiled_at INTEGER,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS reader_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  arxiv_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS reader_events_owner_idx
  ON reader_events(owner_id, arxiv_id);

-- Each reading day, a person's top 20 of the recent papers. The page shows
-- 3; the monthly pick is drawn from a month of these.
CREATE TABLE IF NOT EXISTS daily_picks (
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  rank INTEGER NOT NULL,
  arxiv_id TEXT NOT NULL,
  score REAL NOT NULL,
  matched TEXT NOT NULL,
  PRIMARY KEY (owner_id, day, rank)
);
