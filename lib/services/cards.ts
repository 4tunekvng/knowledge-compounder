import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, sources, type Card } from "@/lib/db/schema";
import { generateMoreCards } from "@/lib/ai/more-cards";

export interface AddMoreCardsResult {
  added: number;
  cards: Card[];
}

/**
 * Generate and persist additional flashcards for an already-processed source.
 * Backs the "Generate more cards" button. New cards are deduped against the
 * source's existing fronts (both via the prompt and a final client-side guard)
 * and start life as New cards, so they surface in the next review session.
 */
export async function addMoreCards(sourceId: number): Promise<AddMoreCardsResult> {
  const db = await getDb();

  const source = await db
    .select({
      title: sources.title,
      rawContent: sources.rawContent,
      status: sources.status,
    })
    .from(sources)
    .where(eq(sources.id, sourceId))
    .get();

  if (!source) throw new Error("Source not found.");
  if (source.status !== "processed") {
    throw new Error("Source is not processed yet — process it before adding cards.");
  }

  const existing = await db
    .select({ front: cards.front })
    .from(cards)
    .where(eq(cards.sourceId, sourceId))
    .all();
  const existingFronts = existing.map((c) => c.front);
  const existingSet = new Set(existingFronts.map((f) => f.trim().toLowerCase()));

  const result = await generateMoreCards({
    title: source.title,
    text: source.rawContent,
    existingFronts,
  });

  // Final dedupe guard in case the model echoes an existing front despite the
  // instruction not to.
  const fresh = result.cards.filter(
    (c) => !existingSet.has(c.front.trim().toLowerCase()),
  );
  if (fresh.length === 0) {
    throw new Error("No new cards generated — the source may already be fully covered.");
  }

  const inserted: Card[] = [];
  for (const card of fresh) {
    const rows = await db
      .insert(cards)
      .values({
        sourceId,
        cardType: card.type,
        front: card.front,
        back: card.back,
      })
      .returning()
      .all();
    if (rows[0]) inserted.push(rows[0]);
  }

  return { added: inserted.length, cards: inserted };
}
