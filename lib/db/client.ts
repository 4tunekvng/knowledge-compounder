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
  const ctx = await getCloudflareContext({ async: true });
  const env = ctx.env as unknown as CloudflareEnv;
  if (!env.DB) {
    throw new Error(
      "DB binding missing. Run `wrangler dev` (not `next dev`) for local development, " +
      "and ensure wrangler.jsonc has a `d1_databases` entry named `DB`.",
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
  try {
    const ctx = await getCloudflareContext({ async: true });
    return ctx.env as unknown as CloudflareEnv;
  } catch {
    return process.env as unknown as CloudflareEnv;
  }
}
