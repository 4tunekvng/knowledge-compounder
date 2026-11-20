import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { ServiceError } from "@/lib/errors";
import { chunkForD1 } from "@/lib/db/chunk";
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
  ownerId: string;
  title: string;
  description?: string;
  sourceIds: number[];
}): Promise<Deck> {
  const title = input.title.trim();
  if (!title) throw new ServiceError("Deck title is required.", 400);
  if (title.length > 200) {
    throw new ServiceError("Deck title is too long (max 200 chars).", 400);
  }

  const requested = Array.from(
    new Set(input.sourceIds.filter((n) => Number.isInteger(n) && n > 0)),
  );
  if (requested.length === 0) {
    throw new ServiceError("Select at least one source for the deck.", 400);
  }

  const db = await getDb();
  // Keep only this person's sources: a deck's public link shows every card
  // in it, so another person's ids must never get in.
  const valid = await Promise.all(
    chunkForD1(requested, 1).map((part) =>
      db
        .select({ id: sources.id })
        .from(sources)
        .where(and(eq(sources.ownerId, input.ownerId), inArray(sources.id, part)))
        .all(),
    ),
  );
  const validIds = valid.flat().map((s) => s.id);
  if (validIds.length === 0) {
    throw new ServiceError("None of the selected sources exist.", 400);
  }

  const description = input.description?.trim() || null;

  const inserted = await db
    .insert(decks)
    .values({
      ownerId: input.ownerId,
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

export async function listDecks(ownerId: string): Promise<DeckSummary[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(decks)
    .where(eq(decks.ownerId, ownerId))
    .orderBy(desc(decks.createdAt))
    .all();

  const summaries: DeckSummary[] = [];
  for (const deck of rows) {
    const sourceIds = parseSourceIds(deck.sourceIds);
    const cardCount = await countCardsForSources(ownerId, sourceIds);
    summaries.push({ deck, sourceIds, cardCount });
  }
  return summaries;
}

export async function deleteDeck(ownerId: string, id: number): Promise<boolean> {
  const db = await getDb();
  const owned = and(eq(decks.id, id), eq(decks.ownerId, ownerId));
  const existing = await db.select({ id: decks.id }).from(decks).where(owned).get();
  if (!existing) return false;
  await db.delete(decks).where(owned).run();
  return true;
}

/**
 * Turn a deck title into a safe download file name stem, shared by the PDF and
 * Anki exports so both files of one deck are named alike.
 */
export function deckFileSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "deck"
  );
}

/**
 * Load a deck by its public share token, together with every flashcard drawn
 * from its sources. Used by the student study page and the PDF / Anki exports.
 * Returns null when the token doesn't match a deck. Public: the token is the
 * access check, and only the deck owner's cards are ever included.
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

  // Slices of ascending ids, each ordered by (source, card), join in order.
  const ascending = [...sourceIds].sort((a, b) => a - b);
  const slices = await Promise.all(
    chunkForD1(ascending, 1).map((part) =>
      db
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
        .where(
          and(eq(cards.ownerId, deck.ownerId), inArray(cards.sourceId, part)),
        )
        .orderBy(cards.sourceId, cards.id)
        .all(),
    ),
  );
  const rows = slices.flat();

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

async function countCardsForSources(
  ownerId: string,
  sourceIds: number[],
): Promise<number> {
  if (sourceIds.length === 0) return 0;
  const db = await getDb();
  const slices = await Promise.all(
    chunkForD1(sourceIds, 1).map((part) =>
      db
        .select({ id: cards.id })
        .from(cards)
        .where(and(eq(cards.ownerId, ownerId), inArray(cards.sourceId, part)))
        .all(),
    ),
  );
  return slices.reduce((total, rows) => total + rows.length, 0);
}
