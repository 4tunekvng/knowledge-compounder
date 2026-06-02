/**
 * Orchestrates an auto-ingest run for one provider:
 *   1. Read the stored token + last sync cursor from `integration_tokens`.
 *   2. Iterate the IngestSource generator, skipping already-ingested items.
 *   3. Feed each new item through the existing AI processing pipeline.
 *   4. Update lastSyncedAt on success.
 *
 * Bounded by `MAX_PER_SYNC` so a wildly-large backlog can't blow the worker's
 * runtime budget or burn through the Claude budget unattended. The user can
 * just press "Sync now" again — the cursor advances per item, so re-runs
 * pick up where the last run stopped.
 */

import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { integrationTokens } from "@/lib/db/schema";
import {
  InvalidTokenError,
  type IngestSource,
} from "./ingest-source";
import { ingestExternal, type ExternalIngestInput } from "./ingest";
import { ReadwiseSource } from "./integrations/readwise";
import { ZoteroSource } from "./integrations/zotero";

export const MAX_PER_SYNC = 200;

export interface SyncResult {
  provider: string;
  added: number;
  skipped: number;
  errors: string[];
  lastSyncedAt: string | null;
  reachedLimit: boolean;
}

/** Registry — add new providers here as they ship. */
function getSource(provider: string): IngestSource {
  switch (provider) {
    case "readwise":
      return new ReadwiseSource();
    case "zotero":
      return new ZoteroSource();
    default:
      throw new Error(`Unknown integration provider: ${provider}`);
  }
}

export async function syncIntegration(
  provider: string,
  /** Override for tests — lets us inject a stubbed source without touching the registry. */
  sourceOverride?: IngestSource,
): Promise<SyncResult> {
  const db = await getDb();
  const row = await db
    .select()
    .from(integrationTokens)
    .where(eq(integrationTokens.provider, provider))
    .get();

  if (!row) {
    throw new Error(
      `No token configured for provider '${provider}'. Paste a token in /integrations first.`,
    );
  }

  const source = sourceOverride ?? getSource(provider);
  const cursor = row.lastSyncedAt ?? undefined;

  let added = 0;
  let skipped = 0;
  let processedCount = 0;
  let latestSeen: Date | null = null;
  let reachedLimit = false;
  const errors: string[] = [];

  try {
    for await (const capture of source.fetchNew(row.token, cursor)) {
      if (processedCount >= MAX_PER_SYNC) {
        reachedLimit = true;
        break;
      }
      processedCount++;

      try {
        const input: ExternalIngestInput = {
          sourceType: provider as ExternalIngestInput["sourceType"],
          externalId: capture.externalId,
          title: capture.title,
          text: capture.text,
          url: capture.url,
          externalUpdatedAt: capture.externalUpdatedAt,
        };
        const result = await ingestExternal(input);
        if (result.status === "skipped") {
          skipped++;
        } else if (result.status === "processed") {
          added++;
        } else {
          // status === "failed" — surface the message but keep going.
          errors.push(
            `${capture.externalId}: ${result.error ?? "processing failed"}`,
          );
        }

        if (
          capture.externalUpdatedAt &&
          (!latestSeen || capture.externalUpdatedAt > latestSeen)
        ) {
          latestSeen = capture.externalUpdatedAt;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${capture.externalId}: ${msg}`);
      }
    }
  } catch (err) {
    if (err instanceof InvalidTokenError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`fetch failed: ${msg}`);
  }

  // Advance the cursor on any non-error path — even if every item was a dup,
  // we still want to record that we successfully checked. If the run errored
  // before reading any page (and latestSeen is null), keep the prior cursor.
  const newCursor = latestSeen ?? (errors.length === 0 ? new Date() : row.lastSyncedAt);
  await db
    .update(integrationTokens)
    .set({
      lastSyncedAt: newCursor,
      updatedAt: new Date(),
    })
    .where(eq(integrationTokens.provider, provider))
    .run();

  return {
    provider,
    added,
    skipped,
    errors,
    lastSyncedAt: newCursor ? newCursor.toISOString() : null,
    reachedLimit,
  };
}

/** Public read of integration status — used by the settings UI. */
export interface IntegrationStatus {
  provider: string;
  configured: boolean;
  lastSyncedAt: string | null;
}

const KNOWN_PROVIDERS = ["readwise"] as const;

export async function listIntegrationStatus(): Promise<IntegrationStatus[]> {
  const db = await getDb();
  const rows = await db.select().from(integrationTokens).all();
  const byProvider = new Map(rows.map((r) => [r.provider, r]));
  return KNOWN_PROVIDERS.map((p) => {
    const r = byProvider.get(p);
    return {
      provider: p,
      configured: !!r,
      lastSyncedAt: r?.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
    };
  });
}

export async function setIntegrationToken(
  provider: string,
  token: string,
): Promise<void> {
  if (!KNOWN_PROVIDERS.includes(provider as (typeof KNOWN_PROVIDERS)[number])) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    throw new Error("Token cannot be empty.");
  }
  const db = await getDb();
  const existing = await db
    .select({ id: integrationTokens.id })
    .from(integrationTokens)
    .where(eq(integrationTokens.provider, provider))
    .get();
  if (existing) {
    await db
      .update(integrationTokens)
      .set({ token: trimmed, updatedAt: new Date() })
      .where(eq(integrationTokens.provider, provider))
      .run();
  } else {
    await db
      .insert(integrationTokens)
      .values({ provider, token: trimmed })
      .run();
  }
}
