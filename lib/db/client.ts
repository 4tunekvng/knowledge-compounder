import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

declare global {
  var __kc_sqlite__: Database.Database | undefined;
  var __kc_db__: ReturnType<typeof buildDb> | undefined;
}

function buildDb(sqlite: Database.Database) {
  return drizzle(sqlite, { schema });
}

function ensureSchema(sqlite: Database.Database) {
  // Single migration: create tables if they don't exist. We use raw SQL here
  // (rather than drizzle-kit migrations) to keep the dev loop frictionless —
  // there's no separate migration step and the file lives next to the schema.
  sqlite.exec(`
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
      ease REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      repetitions INTEGER NOT NULL DEFAULT 0,
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
  `);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
}

export function getDb() {
  if (!globalThis.__kc_db__) {
    const path = process.env.DATABASE_PATH ?? "./knowledge.db";
    const sqlite = new Database(path);
    ensureSchema(sqlite);
    globalThis.__kc_sqlite__ = sqlite;
    globalThis.__kc_db__ = buildDb(sqlite);
  }
  return globalThis.__kc_db__;
}

export function getRawDb() {
  getDb();
  return globalThis.__kc_sqlite__!;
}
