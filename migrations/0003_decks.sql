-- Shareable study decks (the "send it to students" feature). A deck bundles
-- the flashcards from a set of sources behind an unguessable share_token and
-- publishes them to a public, no-login student page at /d/<share_token>.
--
-- Mirrors lib/db/schema.ts. Apply with:
--   wrangler d1 migrations apply knowledge-compounder --remote
--
-- Note: no migration is needed for the new 'pdf' value of sources.kind /
-- sources.source_type — those columns are plain TEXT with no CHECK constraint,
-- so the new enum value is accepted without a schema change.

CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  share_token TEXT NOT NULL UNIQUE,
  source_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS decks_share_token_idx ON decks(share_token);
