/**
 * Database access — Cloudflare D1 via drizzle-orm/d1.
 *
 * D1 is SQLite at the edge. The driver is async, so every repo function
 * is async too. Schema lives in ./schema.ts (drizzle-orm/sqlite-core, which
 * is the same dialect D1 uses).
 *
 * Local dev: run `wrangler dev` (not `next dev`) — that binds env.DB.
 * With `remote: true` in wrangler.jsonc, even local dev hits the live D1.
 *
 * Migrations live in /migrations and are applied with
 * `wrangler d1 migrations apply knowledge-compounder --remote`.
 */

import "server-only";
import { drizzle } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "./schema";

interface CloudflareEnv {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  VOYAGE_API_KEY?: string;
}

export async function getDb() {
  // Local dev / preview / e2e: a DATABASE_PATH env var means we're running in
  // plain Node (next dev), not the Workers runtime. Use the better-sqlite3
  // adapter (dynamically imported so the native module never enters the worker
  // bundle). Production leaves DATABASE_PATH unset and uses the D1 binding.
  const localPath = process.env.DATABASE_PATH;
  if (localPath) {
    const { getLocalDb } = await import("./local");
    return getLocalDb(localPath);
  }

  const ctx = await getCloudflareContext({ async: true });
  const env = ctx.env as unknown as CloudflareEnv;
  if (!env.DB) {
    throw new Error(
      "DB binding missing. Deploy to Cloudflare (D1 bound as `DB`), or set " +
      "DATABASE_PATH for local development with `next dev`.",
    );
  }
  return drizzle(env.DB, { schema });
}

/**
 * Exposes the worker `env` to non-DB code (e.g. AI client reading
 * ANTHROPIC_API_KEY from Worker secrets). Falls back to process.env when
 * not running in a Worker (e.g. unit tests, scripts).
 */
export async function getEnv(): Promise<CloudflareEnv> {
  // In local dev (DATABASE_PATH set) there is no Cloudflare context — read
  // straight from process.env and skip the getCloudflareContext throw.
  if (process.env.DATABASE_PATH) {
    return process.env as unknown as CloudflareEnv;
  }
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx.env as unknown as CloudflareEnv;
  } catch {
    return process.env as unknown as CloudflareEnv;
  }
}
