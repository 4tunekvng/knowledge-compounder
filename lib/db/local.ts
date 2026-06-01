import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/**
 * Local-development database adapter.
 *
 * Production runs on Cloudflare D1 (see ./client.ts). But `next dev`, the
 * preview server, and the Playwright e2e suite all run in plain Node with a
 * `DATABASE_PATH` env var pointing at a SQLite file — that's the contract the
 * repo's tooling already assumes (drizzle.config.ts, playwright.config.ts's
 * `DATABASE_PATH=./knowledge.test.db`, .claude/launch.json's preview DB).
 *
 * This module is dynamically imported from getDb() ONLY when DATABASE_PATH is
 * set, so better-sqlite3 (a native module that can't run in the Workers
 * runtime) never enters the deployed worker bundle.
 *
 * The returned instance is cast to DrizzleD1Database so every call site keeps
 * the same async-looking type. better-sqlite3's drizzle driver is synchronous,
 * but `await` on a non-promise simply yields the value, so `await db.….all()`
 * works identically against both drivers.
 */

// Cache the connection on globalThis, NOT a module-level Map. Next dev bundles
// route handlers and server components into separate module instances, so a
// module-level cache would open a SEPARATE better-sqlite3 connection per
// instance. With WAL, a reader on a different connection can miss a writer's
// just-committed rows for a beat — which surfaced as a captured source 404-ing
// on its own detail page. One process-wide connection removes the race entirely
// (and also survives HMR without leaking connections).
const globalForDb = globalThis as unknown as {
  __kcLocalDbInstances?: Map<string, DrizzleD1Database<typeof schema>>;
};
const instances =
  globalForDb.__kcLocalDbInstances ??
  (globalForDb.__kcLocalDbInstances = new Map<
    string,
    DrizzleD1Database<typeof schema>
  >());

export function getLocalDb(dbPath: string): DrizzleD1Database<typeof schema> {
  const cached = instances.get(dbPath);
  if (cached) return cached;

  const sqlite = new Database(dbPath);
  // WAL improves concurrent read/write behaviour for the dev server's
  // overlapping requests; foreign_keys ON enforces the ON DELETE CASCADEs.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Apply the full schema (idempotent — every statement is IF NOT EXISTS).
  const schemaSql = readFileSync(
    path.join(process.cwd(), "lib", "db", "local-schema.sql"),
    "utf8",
  );
  sqlite.exec(schemaSql);

  const db = drizzle(sqlite, { schema }) as unknown as DrizzleD1Database<
    typeof schema
  >;
  instances.set(dbPath, db);
  return db;
}
