import "server-only";
import { desc, eq, lte, sql } from "drizzle-orm";
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

export function listSources(limit = 50): SourceListItem[] {
  const db = getDb();
  const rows = db
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

export function getSourceDetail(id: number): SourceDetail | null {
  const db = getDb();
  const source = db
    .select()
    .from(sources)
    .where(eq(sources.id, id))
    .get();
  if (!source) return null;

  const processing = db
    .select()
    .from(processings)
    .where(eq(processings.sourceId, id))
    .get() ?? null;

  const sourceCards = db
    .select()
    .from(cards)
    .where(eq(cards.sourceId, id))
    .orderBy(cards.id)
    .all();

  const related = processing?.embedding
    ? findRelated(id, processing.embedding as Buffer)
    : [];

  return {
    source,
    processing,
    cards: sourceCards,
    related,
  };
}

function findRelated(
  excludeSourceId: number,
  queryEmbedding: Buffer,
): { source: Source; processing: Processing; score: number }[] {
  const queryVec = blobToEmbedding(queryEmbedding);
  if (!queryVec) return [];

  const db = getDb();
  const others = db
    .select({
      source: sources,
      processing: processings,
    })
    .from(processings)
    .innerJoin(sources, eq(sources.id, processings.sourceId))
    .all();

  const scored = others
    .filter((o) => o.source.id !== excludeSourceId)
    .map((o) => {
      const otherVec = blobToEmbedding(o.processing.embedding as Buffer);
      const score = otherVec ? cosineSimilarity(queryVec, otherVec) : 0;
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

export function listDueCards(now = new Date(), limit = 50): DueCard[] {
  const db = getDb();
  const rows = db
    .select({
      card: cards,
      sourceId: sources.id,
      sourceTitle: sources.title,
    })
    .from(cards)
    .innerJoin(sources, eq(sources.id, cards.sourceId))
    .where(lte(cards.dueAt, now))
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
export function countDueCards(now = new Date()): number {
  const db = getDb();
  const row = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(cards)
    .where(lte(cards.dueAt, now))
    .get();
  return Number(row?.count ?? 0);
}

export function listThemes(): Theme[] {
  const db = getDb();
  return db.select().from(themes).orderBy(desc(themes.createdAt)).all();
}

export function getTheme(id: number): Theme | null {
  const db = getDb();
  return db.select().from(themes).where(eq(themes.id, id)).get() ?? null;
}

export function getEssay(id: number): Essay | null {
  const db = getDb();
  return db.select().from(essays).where(eq(essays.id, id)).get() ?? null;
}

export function listEssays(): Essay[] {
  const db = getDb();
  return db.select().from(essays).orderBy(desc(essays.createdAt)).all();
}

export interface CorpusSourceForThemes {
  id: number;
  title: string;
  whyICared: string;
  excerpt: string;
  concepts: { name: string; weight: number }[];
}

export function getCorpusForThemes(): CorpusSourceForThemes[] {
  const db = getDb();
  const rows = db
    .select({
      source: sources,
      processing: processings,
    })
    .from(sources)
    .innerJoin(processings, eq(processings.sourceId, sources.id))
    .where(eq(sources.status, "processed"))
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
