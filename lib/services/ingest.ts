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
  const db = getDb();

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

  const inserted = db
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

  const sourceId = inserted[0].id;

  try {
    const result = await processSource({
      title: extracted.title,
      text: extracted.text,
    });

    const vector = await embed(`${extracted.title}\n\n${extracted.text}`);

    db.transaction((tx) => {
      tx.insert(processings)
        .values({
          sourceId,
          whyICared: result.why_i_cared,
          keyTakeaways: JSON.stringify(result.key_takeaways),
          concepts: JSON.stringify(result.concepts),
          embedding: embeddingToBlob(vector),
        })
        .run();

      for (const card of result.cards) {
        tx.insert(cards)
          .values({
            sourceId,
            cardType: card.type,
            front: card.front,
            back: card.back,
          })
          .run();
      }

      tx.update(sources)
        .set({
          status: "processed",
          processedAt: new Date(),
        })
        .where(eq(sources.id, sourceId))
        .run();
    });

    return { sourceId, status: "processed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(sources)
      .set({ status: "failed", errorMessage: message })
      .where(eq(sources.id, sourceId))
      .run();
    return { sourceId, status: "failed", error: message };
  }
}
