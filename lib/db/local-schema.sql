-- Full local-dev schema for the better-sqlite3 adapter (lib/db/local.ts).
-- Mirrors the current state of lib/db/schema.ts AFTER all migrations
-- (0001_init through 0005_owners) are applied. Used only for local dev /
-- preview / Playwright e2e — production runs on Cloudflare D1 and is
-- migrated via `wrangler d1 migrations apply`. Everything is IF NOT EXISTS
-- so applying it repeatedly on an existing dev DB is a no-op.
--
-- The `decks` table at the bottom is from a scaffolded-but-unshipped
-- shareable-decks feature; harmless to create even though no Drizzle table
-- maps to it yet.

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL DEFAULT '',
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
  processed_at INTEGER,
  claimed_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS sources_owner_external_idx
  ON sources(owner_id, source_type, external_id);
CREATE INDEX IF NOT EXISTS sources_owner_created_idx
  ON sources(owner_id, created_at);

CREATE TABLE IF NOT EXISTS integration_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  token TEXT NOT NULL,
  last_synced_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS integration_tokens_owner_provider_idx
  ON integration_tokens(owner_id, provider);

CREATE TABLE IF NOT EXISTS processings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL DEFAULT '',
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  why_i_cared TEXT NOT NULL,
  key_takeaways TEXT NOT NULL,
  concepts TEXT NOT NULL,
  embedding BLOB,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS processings_source_idx ON processings(source_id);
CREATE INDEX IF NOT EXISTS processings_owner_idx ON processings(owner_id);

CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS cards_owner_due_idx ON cards(owner_id, due_at);

CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS themes_owner_idx ON themes(owner_id, created_at);

CREATE TABLE IF NOT EXISTS essays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL DEFAULT '',
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  draft_md TEXT NOT NULL,
  citations TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS essays_owner_idx ON essays(owner_id, created_at);

-- Shareable study decks: a named bundle of sources whose flashcards are
-- published to a public, no-login student page at /d/<share_token>.
CREATE TABLE IF NOT EXISTS decks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT,
  share_token TEXT NOT NULL UNIQUE,
  source_ids TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS decks_share_token_idx ON decks(share_token);
CREATE INDEX IF NOT EXISTS decks_owner_idx ON decks(owner_id, created_at);
