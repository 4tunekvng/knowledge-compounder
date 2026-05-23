-- knowledge-compounder schema. Mirrors lib/db/schema.ts (drizzle-orm/sqlite-core).
-- D1 IS SQLite, so this is one-to-one with what better-sqlite3 used in dev.
--
-- FSRS-5 columns (difficulty, fsrs_state, lapses) are baked in here rather
-- than added via ALTER TABLE — a fresh D1 doesn't need the migration path.

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT,
  raw_content TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  processed_at INTEGER
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
