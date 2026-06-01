-- Full local-dev schema for the better-sqlite3 adapter (lib/db/local.ts).
-- Mirrors the current state of lib/db/schema.ts AFTER all migrations
-- (0001_init + 0002_auto_ingest) are applied. Used only for local dev /
-- preview / Playwright e2e — production runs on Cloudflare D1 and is
-- migrated via `wrangler d1 migrations apply`. Everything is IF NOT EXISTS
-- so applying it repeatedly on an existing dev DB is a no-op.
--
-- The `decks` table at the bottom is from a scaffolded-but-unshipped
-- shareable-decks feature; harmless to create even though no Drizzle table
-- maps to it yet.

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  raw_content TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  source_type TEXT NOT NULL DEFAULT 'url',
  external_id TEXT,
  external_updated_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  processed_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS sources_source_type_external_id_idx
  ON sources(source_type, external_id);

CREATE TABLE IF NOT EXISTS integration_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS processings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  why_i_cared TEXT NOT NULL,
  key_takeaways TEXT NOT NULL,
  concepts TEXT NOT NULL,
  embedding BLOB,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS processings_source_idx ON processings(source_id);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  card_type TEXT NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ease REAL NOT NULL DEFAULT 0,
  interval_days REAL NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  difficulty REAL NOT NULL DEFAULT 5.0,
  fsrs_state INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_reviewed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS cards_due_idx ON cards(due_at);
CREATE INDEX IF NOT EXISTS cards_source_idx ON cards(source_id);

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS essays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  draft_md TEXT NOT NULL,
  citations TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Shareable study decks: a named bundle of sources whose flashcards are
-- published to a public, no-login student page at /d/<share_token>.
CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  share_token TEXT NOT NULL UNIQUE,
  source_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS decks_share_token_idx ON decks(share_token);
