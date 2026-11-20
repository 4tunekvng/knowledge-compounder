import "server-only";
import { and, desc, eq, gt, lte, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  cards,
  essays,
  processings,
  sources,
  themes,
  type Card,
  type Essay,
  type Processing,
  type Source,
  type Theme,
} from "@/lib/db/schema";
import { blobToEmbedding } from "@/lib/embeddings/client";
import { cosineSimilarity, topK } from "@/lib/embeddings/similarity";
import {
  parseCitations,
  parseConcepts,
  parseSourceIds,
  parseTakeaways,
} from "@/lib/parsers";

export interface SourceListItem {
  source: Source;
  processing: Pick<Processing, "whyICared" | "keyTakeaways" | "concepts"> | null;
  cardCount: number;
}

export async function listSources(
  ownerId: string,
  limit = 50,
): Promise<SourceListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      source: sources,
      whyICared: processings.whyICared,
      keyTakeaways: processings.keyTakeaways,
      concepts: processings.concepts,
      cardCount: sql<number>`COUNT(${cards.id})`,
    })
    .from(sources)
    .leftJoin(processings, eq(processings.sourceId, sources.id))
    .leftJoin(cards, eq(cards.sourceId, sources.id))
    .where(eq(sources.ownerId, ownerId))
    .groupBy(sources.id)
    .orderBy(desc(sources.createdAt))
    .limit(limit)
    .all();

  return rows.map((row) => ({
    source: row.source,
    processing: row.whyICared && row.keyTakeaways && row.concepts
      ? {
          whyICared: row.whyICared,
          keyTakeaways: row.keyTakeaways,
          concepts: row.concepts,
        }
      : null,
    cardCount: Number(row.cardCount ?? 0),
  }));
}

export interface SourceDetail {
  source: Source;
  processing: Processing | null;
  cards: Card[];
  related: { source: Source; processing: Processing; score: number }[];
}

export async function getSourceDetail(
  ownerId: string,
  id: number,
): Promise<SourceDetail | null> {
  const db = await getDb();
  const source = await db
    .select()
    .from(sources)
    .where(and(eq(sources.id, id), eq(sources.ownerId, ownerId)))
    .get();
  if (!source) return null;

  const processing = (await db
    .select()
    .from(processings)
    .where(eq(processings.sourceId, id))
    .get()) ?? null;

  const sourceCards = await db
    .select()
    .from(cards)
    .where(eq(cards.sourceId, id))
    .orderBy(cards.id)
    .all();

  const related = processing?.embedding
    ? await findRelated(ownerId, id, processing.embedding as Uint8Array)
    : [];

  return {
    source,
    processing,
    cards: sourceCards,
    related,
  };
}

async function findRelated(
  ownerId: string,
  excludeSourceId: number,
  queryEmbedding: Uint8Array,
): Promise<{ source: Source; processing: Processing; score: number }[]> {
  const queryVec = blobToEmbedding(queryEmbedding);
  if (!queryVec) return [];

  const db = await getDb();
  // Exclude the current source at SQL level so its data is never loaded.
  const others = await db
    .select({
      source: sources,
      processing: processings,
    })
    .from(processings)
    .innerJoin(sources, eq(sources.id, processings.sourceId))
    .where(
      and(
        eq(sources.ownerId, ownerId),
        ne(processings.sourceId, excludeSourceId),
      ),
    )
    .all();

  const scored = others
    .map((o) => {
      const otherVec = blobToEmbedding(o.processing.embedding as Uint8Array);
      // Skip vectors with mismatched dimensions (e.g. mixed Voyage / lexical
      // embeddings stored after a model change). cosineSimilarity throws on
      // length mismatch; we want a graceful 0 score instead.
      const score =
        otherVec && otherVec.length === queryVec.length
          ? cosineSimilarity(queryVec, otherVec)
          : 0;
      return {
        item: { source: o.source, processing: o.processing },
        score,
      };
    })
    .filter((s) => s.score > 0.05);

  return topK(scored, 5).map((s) => ({
    source: s.item.source,
    processing: s.item.processing,
    score: s.score,
  }));
}

export interface DueCard {
  card: Card;
  source: Pick<Source, "id" | "title">;
}

export async function listDueCards(
  ownerId: string,
  now = new Date(),
  limit = 50,
): Promise<DueCard[]> {
  const db = await getDb();
  const rows = await db
    .select({
      card: cards,
      sourceId: sources.id,
      sourceTitle: sources.title,
    })
    .from(cards)
    .innerJoin(sources, eq(sources.id, cards.sourceId))
    .where(and(eq(cards.ownerId, ownerId), lte(cards.dueAt, now)))
    .orderBy(cards.dueAt)
    .limit(limit)
    .all();

  return rows.map((r) => ({
    card: r.card,
    source: { id: r.sourceId, title: r.sourceTitle },
  }));
}

/**
 * Cheap count of cards whose dueAt has passed. Used to drive the Review
 * nav badge — no need to materialize the full row set.
 */
export async function countDueCards(
  ownerId: string,
  now = new Date(),
): Promise<number> {
  const db = await getDb();
  const row = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(cards)
    .where(and(eq(cards.ownerId, ownerId), lte(cards.dueAt, now)))
    .get();
  return Number(row?.count ?? 0);
}

/** When the next card not yet due comes back, or null if there are none. */
export async function nextDueAt(
  ownerId: string,
  now = new Date(),
): Promise<Date | null> {
  const db = await getDb();
  const row = await db
    .select({ dueAt: sql<number>`MIN(${cards.dueAt})` })
    .from(cards)
    .where(and(eq(cards.ownerId, ownerId), gt(cards.dueAt, now)))
    .get();
  return row?.dueAt ? new Date(Number(row.dueAt)) : null;
}

export async function listThemes(ownerId: string): Promise<Theme[]> {
  const db = await getDb();
  return db
    .select()
    .from(themes)
    .where(eq(themes.ownerId, ownerId))
    .orderBy(desc(themes.createdAt))
    .all();
}

export async function getTheme(ownerId: string, id: number): Promise<Theme | null> {
  const db = await getDb();
  const row = await db
    .select()
    .from(themes)
    .where(and(eq(themes.id, id), eq(themes.ownerId, ownerId)))
    .get();
  return row ?? null;
}

export async function getEssay(ownerId: string, id: number): Promise<Essay | null> {
  const db = await getDb();
  const row = await db
    .select()
    .from(essays)
    .where(and(eq(essays.id, id), eq(essays.ownerId, ownerId)))
    .get();
  return row ?? null;
}

export async function listEssays(ownerId: string): Promise<Essay[]> {
  const db = await getDb();
  return db
    .select()
    .from(essays)
    .where(eq(essays.ownerId, ownerId))
    .orderBy(desc(essays.createdAt))
    .all();
}

export interface CorpusSourceForThemes {
  id: number;
  title: string;
  whyICared: string;
  excerpt: string;
  concepts: { name: string; weight: number }[];
}

export async function getCorpusForThemes(
  ownerId: string,
): Promise<CorpusSourceForThemes[]> {
  const db = await getDb();
  const rows = await db
    .select({
      source: sources,
      processing: processings,
    })
    .from(sources)
    .innerJoin(processings, eq(processings.sourceId, sources.id))
    .where(and(eq(sources.ownerId, ownerId), eq(sources.status, "processed")))
    .all();

  return rows.map((r) => ({
    id: r.source.id,
    title: r.source.title,
    whyICared: r.processing.whyICared,
    excerpt: r.source.excerpt,
    concepts: parseConcepts(r.processing.concepts),
  }));
}

export {
  parseCitations,
  parseConcepts,
  parseSourceIds,
  parseTakeaways,
};
