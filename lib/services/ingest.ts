import "server-only";
import { and, eq } from "drizzle-orm";
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

// 10 MB upload ceiling for PDFs — large enough for a book chapter or paper,
// small enough to stay within Worker memory/time limits during extraction.
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface IngestInput {
  raw: string;
}

export interface IngestResult {
  sourceId: number;
  status: "processed" | "failed";
  error?: string;
}

/**
 * Provider-tagged ingest payload — used by the auto-ingest orchestrator.
 * The text is pre-extracted by the provider (Readwise gives us highlight text,
 * Kindle gives us highlight text), so we skip the URL fetcher and just store
 * + process.
 */
export interface ExternalIngestInput {
  sourceType: "readwise"; // extend the union as more providers ship
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
 * sequentially.
 */
async function processAndPersist(
  db: Awaited<ReturnType<typeof getDb>>,
  sourceId: number,
  prompt: { title: string; text: string },
): Promise<IngestResult> {
  try {
    const result = await processSource(prompt);
    const vector = await embed(`${prompt.title}\n\n${prompt.text}`);

    await db
      .insert(processings)
      .values({
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
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(sources)
        .set({ status: "failed", errorMessage: message })
        .where(eq(sources.id, sourceId))
        .run();
    } catch (updateErr) {
      console.error(`Failed to mark source ${sourceId} as failed:`, updateErr);
    }
    return { sourceId, status: "failed", error: message };
  }
}

export async function ingest({ raw }: IngestInput): Promise<IngestResult> {
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
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to extract content: ${message}`);
  }

  const inserted = await db
    .insert(sources)
    .values({
      kind: isUrl ? "url" : "text",
      title: extracted.title,
      url: isUrl ? trimmed : null,
      rawContent: extracted.text,
      excerpt: extracted.excerpt,
      status: "pending",
    })
    .returning({ id: sources.id })
    .all();

  if (inserted.length === 0) {
    throw new Error("INSERT into sources returned no rows — database may be read-only or schema mismatch.");
  }
  const sourceId = inserted[0].id;

  return processAndPersist(db, sourceId, {
    title: extracted.title,
    text: extracted.text,
  });
}

export interface IngestPdfInput {
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
  filename,
  bytes,
}: IngestPdfInput): Promise<IngestResult> {
  if (bytes.byteLength === 0) {
    throw new Error("Failed to extract content: the PDF file was empty.");
  }
  const db = await getDb();

  let extracted;
  try {
    extracted = await extractFromPdf(bytes, filename);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to extract content: ${message}`);
  }

  const inserted = await db
    .insert(sources)
    .values({
      kind: "pdf",
      title: extracted.title,
      url: null,
      rawContent: extracted.text,
      excerpt: extracted.excerpt,
      status: "pending",
      sourceType: "pdf",
    })
    .returning({ id: sources.id })
    .all();

  if (inserted.length === 0) {
    throw new Error(
      "INSERT into sources returned no rows — database may be read-only or schema mismatch.",
    );
  }
  const sourceId = inserted[0].id;

  return processAndPersist(db, sourceId, {
    title: extracted.title,
    text: extracted.text,
  });
}

/**
 * Ingest a capture that originated from an external provider (Readwise,
 * Kindle, etc.). Skips URL extraction — the provider has already given us
 * clean text. Title/text are sanitized before being interpolated into the
 * LLM prompt (defense in depth — a malicious highlight note can't jailbreak
 * the processor).
 *
 * Returns `{ status: "skipped" }` if `(sourceType, externalId)` already
 * exists, so re-syncing is idempotent.
 */
export type ExternalIngestResult =
  | { sourceId: number; status: "processed" | "failed"; error?: string }
  | { sourceId: number; status: "skipped"; reason: "duplicate" };

export async function ingestExternal(
  input: ExternalIngestInput,
): Promise<ExternalIngestResult> {
  const db = await getDb();

  // Dedup check — the (source_type, external_id) unique index also enforces
  // this at the DB level, but doing the lookup first lets us return a clean
  // "skipped" result rather than a constraint-violation error.
  const existing = await db
    .select({ id: sources.id })
    .from(sources)
    .where(
      and(
        eq(sources.sourceType, input.sourceType),
        eq(sources.externalId, input.externalId),
      ),
    )
    .get();
  if (existing) {
    return { sourceId: existing.id, status: "skipped", reason: "duplicate" };
  }

  // Sanitize before we let title/text/url anywhere near a Claude prompt.
  // We store the *original* text (raw_content + excerpt) so the user sees
  // their highlight verbatim — only the values we pass to processSource()
  // are sanitized.
  const safeTitle = sanitizeForPrompt(input.title) || "Untitled";
  const safeText = sanitizeForPrompt(input.text);
  const excerpt =
    input.text.length <= 280 ? input.text : input.text.slice(0, 277) + "…";

  const inserted = await db
    .insert(sources)
    .values({
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
  const sourceId = inserted[0].id;

  try {
    const result = await processSource({ title: safeTitle, text: safeText });
    const vector = await embed(`${safeTitle}\n\n${safeText}`);

    await db
      .insert(processings)
      .values({
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
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(sources)
        .set({ status: "failed", errorMessage: message })
        .where(eq(sources.id, sourceId))
        .run();
    } catch (updateErr) {
      console.error(`Failed to mark source ${sourceId} as failed:`, updateErr);
    }
    return { sourceId, status: "failed", error: message };
  }
}

/**
 * Retry the AI-processing step for an existing source — used by the
 * Retry button on a failed source page. Re-uses the already-extracted
 * rawContent + title so we don't re-fetch the URL.
 */
export async function retrySource(sourceId: number): Promise<IngestResult> {
  const db = await getDb();
  const row = await db
    .select({
      title: sources.title,
      rawContent: sources.rawContent,
      status: sources.status,
    })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .get();

  if (!row) throw new Error("Source not found.");

  // Atomically flip status from "failed" → "pending". By adding status="failed"
  // to the WHERE clause we guard against a concurrent retry that already won
  // the race — if changes===0 the row either doesn't exist or is no longer
  // in a failed state, so we surface the same error the explicit check would have.
  const resetResult = await db
    .update(sources)
    .set({ status: "pending", errorMessage: null, processedAt: null })
    .where(and(eq(sources.id, sourceId), eq(sources.status, "failed")))
    .run();

  if ((resetResult as { meta?: { changes?: number } }).meta?.changes === 0) {
    // Re-read to give a precise error message (source may have been retried
    // concurrently, or was never in a failed state).
    const current = await db
      .select({ status: sources.status })
      .from(sources)
      .where(eq(sources.id, sourceId))
      .get();
    if (!current) throw new Error("Source not found.");
    throw new Error(
      `Source is not in a failed state (current status: ${current.status}). Only failed sources can be retried.`,
    );
  }
  try {
    await db.delete(processings).where(eq(processings.sourceId, sourceId)).run();
    await db.delete(cards).where(eq(cards.sourceId, sourceId)).run();

    const result = await processSource({
      title: row.title,
      text: row.rawContent,
    });
    const vector = await embed(`${row.title}\n\n${row.rawContent}`);

    await db
      .insert(processings)
      .values({
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
    const message = err instanceof Error ? err.message : String(err);
    try {
      await db
        .update(sources)
        .set({ status: "failed", errorMessage: message })
        .where(eq(sources.id, sourceId))
        .run();
    } catch (updateErr) {
      console.error(`Failed to mark source ${sourceId} as failed:`, updateErr);
    }
    return { sourceId, status: "failed", error: message };
  }
}
