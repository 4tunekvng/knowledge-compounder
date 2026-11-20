import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, processings, sources } from "@/lib/db/schema";
import { processSource } from "@/lib/ai/process";
import { embed, embeddingToBlob } from "@/lib/embeddings/client";
import {
  extractFromText,
  extractFromUrl,
  looksLikeUrl,
} from "@/lib/extract/url";
import { extractFromPdf } from "@/lib/extract/pdf";
import { sanitizeForPrompt } from "./ingest-source";
import { CaptureError, ServiceError } from "@/lib/errors";
import type { CaptureFailure } from "@/lib/error-copy";

/**
 * How long a claim on a pending row holds before the drain treats its worker
 * as dead and takes the row. Guessing wrong is safe, since only the worker
 * holding the current claim writes results (renewClaim); it costs one extra
 * model call. 35 minutes outlasts a normal slow request: one model call can
 * take three 10-minute attempts (the SDK's default timeout and two retries).
 */
export const CLAIM_TIMEOUT_MS = 35 * 60_000;

/**
 * Tries a row gets, counting the request that stored it, before the drain
 * marks it failed so the source page offers Retry. A row that killed its
 * worker three times will not do better on a fourth, and each try is a
 * model call.
 */
export const MAX_ATTEMPTS = 3;

// 10 MB upload ceiling for PDFs — large enough for a book chapter or paper,
// small enough to stay within Worker memory/time limits during extraction.
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface IngestInput {
  /** Google account id of the person capturing. */
  ownerId: string;
  raw: string;
}

export interface IngestResult {
  sourceId: number;
  // "pending": another worker took the row over and is still on it.
  status: "processed" | "failed" | "pending";
  error?: string;
}

type Db = Awaited<ReturnType<typeof getDb>>;

/**
 * A worker's hold on a source row: the claimed_at value it stamped, and the
 * person the row belongs to, whose processing and cards it writes.
 */
interface Claim {
  sourceId: number;
  ownerId: string;
  at: Date;
}

/**
 * Rows an UPDATE changed. D1 reports it under `meta.changes`; better-sqlite3
 * (local dev and tests) at the top level as `changes`.
 */
function changedRows(result: unknown): number | undefined {
  return (
    (result as { meta?: { changes?: number } }).meta?.changes ??
    (result as { changes?: number }).changes
  );
}

/**
 * Re-stamp the row if our claim is still the current one. Called before any
 * result is written: a drain that took the row over while the model ran has
 * replaced the stamp, so the slower worker finds it gone and writes nothing.
 */
async function renewClaim(db: Db, claim: Claim): Promise<Claim | null> {
  const at = new Date();
  const result = await db
    .update(sources)
    .set({ claimedAt: at })
    .where(
      and(
        eq(sources.id, claim.sourceId),
        eq(sources.status, "pending"),
        eq(sources.claimedAt, claim.at),
      ),
    )
    .run();
  return changedRows(result) === 1 ? { ...claim, at } : null;
}

/** What became of a row another worker took over. */
async function currentResult(db: Db, sourceId: number): Promise<IngestResult> {
  const row = await db
    .select({ status: sources.status })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .get();
  const status = row?.status ?? "failed";
  return status === "failed"
    ? { sourceId, status, error: PROCESSING_FAILED_MESSAGE }
    : { sourceId, status };
}

/**
 * Provider-tagged ingest payload — used by the auto-ingest orchestrator.
 * The text is pre-extracted by the provider (Readwise gives us highlight text,
 * Kindle gives us highlight text), so we skip the URL fetcher and just store
 * + process.
 */
export interface ExternalIngestInput {
  ownerId: string;
  sourceType: "readwise" | "zotero" | "arxiv";
  externalId: string;
  title: string;
  text: string;
  url?: string;
  externalUpdatedAt?: Date;
}

/**
 * Shared tail of every ingest path: run Claude processing, embed, persist the
 * processing + cards, and flip the source to "processed". On any failure the
 * source is marked "failed" with the error so the UI can show a Retry button.
 * D1 has no multi-statement transactions over the binding, so writes run
 * sequentially, and only while `claim` is still the row's current claim.
 */
async function processAndPersist(
  db: Db,
  claim: Claim,
  prompt: { title: string; text: string },
  options: { replaceExisting?: boolean } = {},
): Promise<IngestResult> {
  const { sourceId, ownerId } = claim;
  let held = claim;
  try {
    const result = await processSource(prompt);
    const vector = await embed(`${prompt.title}\n\n${prompt.text}`);
    const renewed = await renewClaim(db, held);
    if (!renewed) return currentResult(db, sourceId);
    held = renewed;

    if (options.replaceExisting) {
      await db.delete(processings).where(eq(processings.sourceId, sourceId)).run();
      await db.delete(cards).where(eq(cards.sourceId, sourceId)).run();
    }

    await db
      .insert(processings)
      .values({
        ownerId,
        sourceId,
        whyICared: result.why_i_cared,
        keyTakeaways: JSON.stringify(result.key_takeaways),
        concepts: JSON.stringify(result.concepts),
        embedding: embeddingToBlob(vector),
      })
      .run();

    for (const card of result.cards) {
      await db
        .insert(cards)
        .values({
          ownerId,
          sourceId,
          cardType: card.type,
          front: card.front,
          back: card.back,
        })
        .run();
    }

    await db
      .update(sources)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(sources.id, sourceId))
      .run();

    return { sourceId, status: "processed" };
  } catch (err) {
    return markFailed(db, held, err, options);
  }
}

/** Fixed text callers get back; the raw error can name gateway hosts. */
export const PROCESSING_FAILED_MESSAGE =
  "Processing failed. Open the source to retry.";

/**
 * Record a processing failure on the source so the UI can show a Retry
 * button. The raw error is logged and stored on the source row; callers
 * (HTTP responses, sync summaries, the source page) get only fixed text.
 * A worker whose row was taken over leaves the row to the new worker.
 */
async function markFailed(
  db: Db,
  claim: Claim,
  err: unknown,
  options: { replaceExisting?: boolean } = {},
): Promise<IngestResult> {
  const { sourceId } = claim;
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Processing source ${sourceId} failed:`, err);
  try {
    const result = await db
      .update(sources)
      .set({ status: "failed", errorMessage: message })
      .where(
        and(eq(sources.id, sourceId), eq(sources.claimedAt, claim.at)),
      )
      .run();
    if (changedRows(result) === 0) return currentResult(db, sourceId);
    if (options.replaceExisting) {
      await db.delete(processings).where(eq(processings.sourceId, sourceId)).run();
      await db.delete(cards).where(eq(cards.sourceId, sourceId)).run();
    }
  } catch (updateErr) {
    console.error(`Failed to mark source ${sourceId} as failed:`, updateErr);
  }
  return { sourceId, status: "failed", error: PROCESSING_FAILED_MESSAGE };
}

/**
 * An extractor's typed failure passes through with its own status (502 when
 * the site failed, 422 when the reader can fix the input); anything else is
 * filed under `fallback` as a 422.
 */
function extractionFailed(
  err: unknown,
  fallback: CaptureFailure,
): CaptureError {
  if (err instanceof CaptureError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new CaptureError(`Failed to extract content: ${message}`, 422, fallback);
}

export async function ingest({
  ownerId,
  raw,
}: IngestInput): Promise<IngestResult> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error("Capture is empty.");
  }
  const db = await getDb();

  const isUrl = looksLikeUrl(trimmed);
  let extracted;
  try {
    extracted = isUrl
      ? await extractFromUrl(trimmed)
      : extractFromText(trimmed);
  } catch (err) {
    throw extractionFailed(err, "cannot-open");
  }

  const claimedAt = new Date();
  const inserted = await db
    .insert(sources)
    .values({
      ownerId,
      kind: isUrl ? "url" : "text",
      title: extracted.title,
      url: isUrl ? trimmed : null,
      rawContent: extracted.text,
      excerpt: extracted.excerpt,
      status: "pending",
      // This request processes the row itself; the claim keeps the drain off.
      claimedAt,
      attempts: 1,
    })
    .returning({ id: sources.id })
    .all();

  if (inserted.length === 0) {
    throw new Error("INSERT into sources returned no rows — database may be read-only or schema mismatch.");
  }
  const sourceId = inserted[0].id;

  return processAndPersist(db, { sourceId, ownerId, at: claimedAt }, {
    title: sanitizeForPrompt(extracted.title) || "Untitled",
    text: sanitizeForPrompt(extracted.text),
  });
}

export interface IngestPdfInput {
  ownerId: string;
  filename: string;
  bytes: Uint8Array;
}

/**
 * Ingest an uploaded PDF: extract its text with unpdf, store it as a `pdf`
 * source, then run the same processing pipeline as every other capture.
 * Extraction failures (empty/scanned PDFs) are thrown before any row is
 * written, so they surface as a clean 422 rather than a stuck "pending" source.
 */
export async function ingestPdf({
  ownerId,
  filename,
  bytes,
}: IngestPdfInput): Promise<IngestResult> {
  if (bytes.byteLength === 0) {
    throw new CaptureError(
      "Failed to extract content: the PDF file was empty.",
      422,
      "pdf-no-text",
    );
  }
  const db = await getDb();

  let extracted;
  try {
    extracted = await extractFromPdf(bytes, filename);
  } catch (err) {
    throw extractionFailed(err, "pdf-no-text");
  }

  const claimedAt = new Date();
  const inserted = await db
    .insert(sources)
    .values({
      ownerId,
      kind: "pdf",
      title: extracted.title,
      url: null,
      rawContent: extracted.text,
      excerpt: extracted.excerpt,
      status: "pending",
      sourceType: "pdf",
      claimedAt,
      attempts: 1,
    })
    .returning({ id: sources.id })
    .all();

  if (inserted.length === 0) {
    throw new Error(
      "INSERT into sources returned no rows — database may be read-only or schema mismatch.",
    );
  }
  const sourceId = inserted[0].id;

  return processAndPersist(db, { sourceId, ownerId, at: claimedAt }, {
    title: sanitizeForPrompt(extracted.title) || "Untitled",
    text: sanitizeForPrompt(extracted.text),
  });
}

/**
 * Store a capture that originated from an external provider (Readwise,
 * Kindle, etc.) as an unclaimed pending row. Skips URL extraction — the
 * provider has already given us clean text. The AI work happens later in
 * processPendingSources, so a sync of hundreds of highlights is only
 * database writes and cannot leave rows half-processed when its request ends.
 *
 * Returns `{ status: "skipped" }` if this person already has
 * `(sourceType, externalId)`, so re-syncing is idempotent.
 */
export type ExternalIngestResult =
  | { sourceId: number; status: "pending" }
  | { sourceId: number; status: "skipped"; reason: "duplicate" };

export async function ingestExternal(
  input: ExternalIngestInput,
): Promise<ExternalIngestResult> {
  const db = await getDb();

  // Dedup check — the (owner_id, source_type, external_id) unique index also
  // enforces this at the DB level, but doing the lookup first lets us return
  // a clean "skipped" result rather than a constraint-violation error.
  const existing = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.ownerId, input.ownerId),
        eq(sources.sourceType, input.sourceType),
        eq(sources.externalId, input.externalId),
      ),
    )
    .get();
  if (existing) {
    return { sourceId: existing.id, status: "skipped", reason: "duplicate" };
  }

  // We store the *original* text (raw_content + excerpt) so the user sees
  // their highlight verbatim; the drain sanitizes what it sends to Claude.
  const excerpt =
    input.text.length <= 280 ? input.text : input.text.slice(0, 277) + "…";

  const inserted = await db
    .insert(sources)
    .values({
      ownerId: input.ownerId,
      kind: "text", // body is plain text — same code path as a pasted text capture
      title: input.title.slice(0, 200) || "Untitled",
      url: input.url ?? null,
      rawContent: input.text,
      excerpt,
      status: "pending",
      sourceType: input.sourceType,
      externalId: input.externalId,
      externalUpdatedAt: input.externalUpdatedAt ?? null,
    })
    .returning({ id: sources.id })
    .all();

  if (inserted.length === 0) {
    throw new Error(
      "INSERT into sources returned no rows — database may be read-only or schema mismatch.",
    );
  }
  return { sourceId: inserted[0].id, status: "pending" };
}

type StoredSource = { id: number; title: string; rawContent: string };

/**
 * Process a row from what is already stored: drop any processing or cards a
 * previous attempt left behind, then run the pipeline on the sanitized
 * title and text (defense in depth: a malicious highlight can't jailbreak
 * the processor).
 */
async function reprocessStored(
  db: Db,
  claim: Claim,
  row: StoredSource,
): Promise<IngestResult> {
  const prompt = {
    title: sanitizeForPrompt(row.title) || "Untitled",
    text: sanitizeForPrompt(row.rawContent),
  };
  return processAndPersist(db, claim, prompt, { replaceExisting: true });
}

/** Pending rows nobody is working on: never claimed, or claimed too long ago. */
function unclaimedPending(now: Date) {
  const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
  return and(
    eq(sources.status, "pending"),
    or(isNull(sources.claimedAt), lt(sources.claimedAt, staleBefore)),
  );
}

/**
 * Atomically claim the oldest pending row nobody is working on: never
 * claimed (stored by sync) or claimed so long ago its worker must be dead.
 * One UPDATE picks and stamps the row, so two drains running at once can
 * never both get it.
 */
async function claimNextPending(
  db: Db,
): Promise<{ claim: Claim; row: StoredSource } | undefined> {
  const now = new Date();
  const oldestFree = db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(unclaimedPending(now), lt(sources.attempts, MAX_ATTEMPTS)),
    )
    .orderBy(asc(sources.id))
    .limit(1);
  const [row] = await db
    .update(sources)
    .set({ claimedAt: now, attempts: sql`${sources.attempts} + 1` })
    .where(inArray(sources.id, oldestFree))
    .returning({
      id: sources.id,
      ownerId: sources.ownerId,
      title: sources.title,
      rawContent: sources.rawContent,
    })
    .all();
  return (
    row && { claim: { sourceId: row.id, ownerId: row.ownerId, at: now }, row }
  );
}

export const GAVE_UP_MESSAGE = `Gave up after ${MAX_ATTEMPTS} attempts.`;

/**
 * The drain: process up to `limit` pending rows, one claim at a time, so a
 * drain that is cut off strands at most the row it was working on. Run by
 * the scheduled worker (worker.ts → POST /api/drain). It serves everyone's
 * rows; each claim carries its row's owner, whose processing and cards it
 * writes.
 */
export async function processPendingSources(
  limit: number,
): Promise<IngestResult[]> {
  const db = await getDb();
  await db
    .update(sources)
    .set({ status: "failed", errorMessage: GAVE_UP_MESSAGE })
    .where(
      and(unclaimedPending(new Date()), gte(sources.attempts, MAX_ATTEMPTS)),
    )
    .run();
  const results: IngestResult[] = [];
  while (results.length < limit) {
    const next = await claimNextPending(db);
    if (!next) break;
    results.push(await reprocessStored(db, next.claim, next.row));
  }
  return results;
}

/**
 * Retry the AI-processing step for an existing source — used by the
 * Retry button on a failed source page. Re-uses the already-extracted
 * rawContent + title so we don't re-fetch the URL.
 */
export async function retrySource(
  ownerId: string,
  sourceId: number,
): Promise<IngestResult> {
  const db = await getDb();
  const owned = and(eq(sources.id, sourceId), eq(sources.ownerId, ownerId));
  const row = await db
    .select({
      title: sources.title,
      rawContent: sources.rawContent,
      status: sources.status,
    })
    .from(sources)
    .where(owned)
    .get();

  if (!row) throw new ServiceError("Source not found.", 404);

  // Atomically flip status from "failed" → "pending". By adding status="failed"
  // to the WHERE clause we guard against a concurrent retry that already won
  // the race — if changes===0 the row either doesn't exist or is no longer
  // in a failed state, so we surface the same error the explicit check would have.
  const claimedAt = new Date();
  const resetResult = await db
    .update(sources)
    .set({
      status: "pending",
      errorMessage: null,
      processedAt: null,
      claimedAt,
      attempts: 1,
    })
    .where(and(owned, eq(sources.status, "failed")))
    .run();

  // changedRows reads both runtimes' row counts — an undefined `meta` made the
  // original check always false in local dev, allowing re-processing of
  // non-failed sources.
  if (changedRows(resetResult) === 0) {
    // Re-read to give a precise error message (source may have been retried
    // concurrently, or was never in a failed state).
    const current = await db
      .select({ status: sources.status })
      .from(sources)
      .where(owned)
      .get();
    if (!current) throw new ServiceError("Source not found.", 404);
    throw new ServiceError(
      `Source is not in a failed state (current status: ${current.status}). Only failed sources can be retried.`,
      409,
    );
  }
  return reprocessStored(db, { sourceId, ownerId, at: claimedAt }, {
    id: sourceId,
    title: row.title,
    rawContent: row.rawContent,
  });
}
