import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, processings, sources } from "@/lib/db/schema";
import { processSource } from "@/lib/ai/process";
import { embed, embeddingToBlob } from "@/lib/embeddings/client";
import {
  extractFromText,
  extractFromUrl,
  looksLikeUrl,
} from "@/lib/extract/url";

export interface IngestInput {
  raw: string;
}

export interface IngestResult {
  sourceId: number;
  status: "processed" | "failed";
  error?: string;
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

  try {
    const result = await processSource({
      title: extracted.title,
      text: extracted.text,
    });

    const vector = await embed(`${extracted.title}\n\n${extracted.text}`);

    // D1 doesn't support multi-statement transactions over the worker binding,
    // so we run inserts sequentially. If a write fails midway, the catch
    // block below marks the source as failed; the user can retry from the UI.
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
      .set({
        status: "processed",
        processedAt: new Date(),
      })
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
  if (row.status !== "failed") {
    throw new Error(
      `Source is not in a failed state (current status: ${row.status}). Only failed sources can be retried.`,
    );
  }

  // Reset the source to pending and clear any prior processings/cards.
  // ON DELETE CASCADE on processings.source_id and cards.source_id would let
  // us skip the explicit deletes, but being explicit keeps the intent clear.
  await db
    .update(sources)
    .set({ status: "pending", errorMessage: null, processedAt: null })
    .where(eq(sources.id, sourceId))
    .run();
  await db.delete(processings).where(eq(processings.sourceId, sourceId)).run();
  await db.delete(cards).where(eq(cards.sourceId, sourceId)).run();

  try {
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
