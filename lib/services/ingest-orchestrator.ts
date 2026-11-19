/**
 * Orchestrates an auto-ingest run for one person and provider:
 *   1. Read their sealed token + last sync cursor from `integration_tokens`.
 *   2. Iterate the IngestSource generator, skipping already-ingested items.
 *   3. Store each new item as a pending row. The scheduled drain
 *      (processPendingSources) does the AI work later, so this request is
 *      only database writes and never ends with rows half-processed.
 *   4. Update lastSyncedAt on success.
 *
 * Bounded by `MAX_PER_SYNC` new items so a wildly-large backlog can't blow the
 * request's time or queue an unbounded amount of Claude work at once. The
 * provider stream is not sorted by update time, so the cursor only advances
 * after a complete run; a run cut short (or with an item that threw) keeps the
 * old cursor, and the next "Sync now" skips what it already ingested
 * (duplicates don't count toward the limit) and carries on.
 */

import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, getEnv } from "@/lib/db/client";
import { integrationTokens } from "@/lib/db/schema";
import { openToken, sealToken } from "@/lib/token-box";
import {
  InvalidTokenError,
  type IngestSource,
} from "./ingest-source";
import { ingestExternal, type ExternalIngestInput } from "./ingest";
import { ReadwiseSource } from "./integrations/readwise";
import { ZoteroSource } from "./integrations/zotero";

export const MAX_PER_SYNC = 200;

/**
 * Fixed text for an item sync could not store. The cursor stays put, so the
 * next sync fetches it again.
 */
export const SAVE_FAILED_MESSAGE =
  "Saving this highlight failed. The next sync tries again.";

/** Fixed text for the sync summary; the raw fetch error is only logged. */
export const FETCH_FAILED_MESSAGE =
  "Fetching from the provider failed. Try again later.";

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

function ownedToken(ownerId: string, provider: string) {
  return and(
    eq(integrationTokens.ownerId, ownerId),
    eq(integrationTokens.provider, provider),
  );
}

export async function syncIntegration(
  ownerId: string,
  provider: string,
  /** Override for tests — lets us inject a stubbed source without touching the registry. */
  sourceOverride?: IngestSource,
): Promise<SyncResult> {
  const db = await getDb();
  const row = await db
    .select()
    .from(integrationTokens)
    .where(ownedToken(ownerId, provider))
    .get();

  if (!row) {
    throw new Error(
      `No token configured for provider '${provider}'. Paste a token in /integrations first.`,
    );
  }

  const token = await openToken(row.token, (await getEnv()).KC_TOKEN_KEY, {
    ownerId,
    provider,
  });
  if (token === null) throw new InvalidTokenError(provider);

  const source = sourceOverride ?? getSource(provider);
  const cursor = row.lastSyncedAt ?? undefined;

  let added = 0;
  let skipped = 0;
  let newCount = 0;
  let latestSeen: Date | null = null;
  let reachedLimit = false;
  let fetchFailed = false;
  let itemThrew = false;
  const errors: string[] = [];

  try {
    for await (const capture of source.fetchNew(token, cursor)) {
      if (newCount >= MAX_PER_SYNC) {
        reachedLimit = true;
        break;
      }
      try {
        const input: ExternalIngestInput = {
          ownerId,
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
        } else {
          newCount++;
          added++;
        }

        if (
          capture.externalUpdatedAt &&
          (!latestSeen || capture.externalUpdatedAt > latestSeen)
        ) {
          latestSeen = capture.externalUpdatedAt;
        }
      } catch (err) {
        // The summary goes to the browser; the raw error can name hosts.
        console.error(`Sync item ${capture.externalId} failed:`, err);
        newCount++;
        itemThrew = true;
        errors.push(`${capture.externalId}: ${SAVE_FAILED_MESSAGE}`);
      }
    }
  } catch (err) {
    if (err instanceof InvalidTokenError) throw err;
    console.error(`Fetching ${provider} captures failed:`, err);
    fetchFailed = true;
    errors.push(FETCH_FAILED_MESSAGE);
  }

  // Advance the cursor only after reading the whole stream — even if every item
  // was a dup, we still want to record that we successfully checked. A run cut
  // short by the limit or a fetch error keeps the prior cursor: items after the
  // stop can be older than the newest one seen, and would be skipped for good.
  // So does an item that threw (a database error, say): it may never have
  // been stored, so only a rerun can pick it up.
  const complete = !reachedLimit && !fetchFailed && !itemThrew;
  const newCursor = !complete
    ? row.lastSyncedAt
    : latestSeen ?? (errors.length === 0 ? new Date() : row.lastSyncedAt);
  await db
    .update(integrationTokens)
    .set({
      lastSyncedAt: newCursor,
      updatedAt: new Date(),
    })
    .where(ownedToken(ownerId, provider))
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

export async function listIntegrationStatus(
  ownerId: string,
): Promise<IntegrationStatus[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(integrationTokens)
    .where(eq(integrationTokens.ownerId, ownerId))
    .all();
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
  ownerId: string,
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
  const sealed = await sealToken(trimmed, (await getEnv()).KC_TOKEN_KEY, {
    ownerId,
    provider,
  });
  const db = await getDb();
  const existing = await db
    .select({ id: integrationTokens.id })
    .from(integrationTokens)
    .where(ownedToken(ownerId, provider))
    .get();
  if (existing) {
    await db
      .update(integrationTokens)
      .set({ token: sealed, updatedAt: new Date() })
      .where(ownedToken(ownerId, provider))
      .run();
  } else {
    await db
      .insert(integrationTokens)
      .values({ ownerId, provider, token: sealed })
      .run();
  }
}
