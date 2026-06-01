import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, decks, sources, type Deck } from "@/lib/db/schema";
import { parseSourceIds } from "@/lib/parsers";

export interface DeckCard {
  id: number;
  cardType: "definition" | "mechanism" | "application";
  front: string;
  back: string;
  sourceId: number;
  sourceTitle: string;
}

export interface DeckSummary {
  deck: Deck;
  sourceIds: number[];
  cardCount: number;
}

export interface DeckWithCards {
  deck: Deck;
  sourceTitles: { id: number; title: string }[];
  cards: DeckCard[];
}

/** 128-bit unguessable share token (hex). Works in Node and the Workers runtime. */
function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

/**
 * Create a shareable deck from a set of (processed) sources. Returns the new
 * deck row, including its share_token. Throws on empty title / no valid
 * sources so the API can return a clean 400.
 */
export async function createDeck(input: {
  title: string;
  description?: string;
  sourceIds: number[];
}): Promise<Deck> {
  const title = input.title.trim();
  if (!title) throw new Error("Deck title is required.");
  if (title.length > 200) throw new Error("Deck title is too long (max 200 chars).");

  const requested = Array.from(
    new Set(input.sourceIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  if (requested.length === 0) {
    throw new Error("Select at least one source for the deck.");
  }

  const db = await getDb();
  // Keep only sources that actually exist and are processed.
  const valid = await db
    .select({ id: sources.id })
    .from(sources)
    .where(inArray(sources.id, requested))
    .all();
  const validIds = valid.map((s) => s.id);
  if (validIds.length === 0) {
    throw new Error("None of the selected sources exist.");
  }

  const description = input.description?.trim() || null;

  const inserted = await db
    .insert(decks)
    .values({
      title,
      description,
      shareToken: generateShareToken(),
      sourceIds: JSON.stringify(validIds),
    })
    .returning()
    .all();
  if (!inserted[0]) throw new Error("INSERT for deck returned no rows.");
  return inserted[0];
}

export async function listDecks(): Promise<DeckSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(decks).orderBy(desc(decks.createdAt)).all();

  const summaries: DeckSummary[] = [];
  for (const deck of rows) {
    const sourceIds = parseSourceIds(deck.sourceIds);
    const cardCount = await countCardsForSources(sourceIds);
    summaries.push({ deck, sourceIds, cardCount });
  }
  return summaries;
}

export async function deleteDeck(id: number): Promise<boolean> {
  const db = await getDb();
  const existing = await db
    .select({ id: decks.id })
    .from(decks)
    .where(eq(decks.id, id))
    .get();
  if (!existing) return false;
  await db.delete(decks).where(eq(decks.id, id)).run();
  return true;
}

/**
 * Load a deck by its public share token, together with every flashcard drawn
 * from its sources. Used by the student study page and the PDF / Anki exports.
 * Returns null when the token doesn't match a deck.
 */
export async function getDeckByToken(token: string): Promise<DeckWithCards | null> {
  const db = await getDb();
  const deck = await db
    .select()
    .from(decks)
    .where(eq(decks.shareToken, token))
    .get();
  if (!deck) return null;

  const sourceIds = parseSourceIds(deck.sourceIds);
  if (sourceIds.length === 0) {
    return { deck, sourceTitles: [], cards: [] };
  }

  const rows = await db
    .select({
      id: cards.id,
      cardType: cards.cardType,
      front: cards.front,
      back: cards.back,
      sourceId: sources.id,
      sourceTitle: sources.title,
    })
    .from(cards)
    .innerJoin(sources, eq(sources.id, cards.sourceId))
    .where(inArray(cards.sourceId, sourceIds))
    .orderBy(cards.sourceId, cards.id)
    .all();

  const titleMap = new Map<number, string>();
  for (const r of rows) titleMap.set(r.sourceId, r.sourceTitle);
  const sourceTitles = sourceIds
    .filter((id) => titleMap.has(id))
    .map((id) => ({ id, title: titleMap.get(id)! }));

  return {
    deck,
    sourceTitles,
    cards: rows.map((r) => ({
      id: r.id,
      cardType: r.cardType,
      front: r.front,
      back: r.back,
      sourceId: r.sourceId,
      sourceTitle: r.sourceTitle,
    })),
  };
}

async function countCardsForSources(sourceIds: number[]): Promise<number> {
  if (sourceIds.length === 0) return 0;
  const db = await getDb();
  const rows = await db
    .select({ id: cards.id })
    .from(cards)
    .where(inArray(cards.sourceId, sourceIds))
    .all();
  return rows.length;
}
