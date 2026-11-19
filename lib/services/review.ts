import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, type Card } from "@/lib/db/schema";
import {
  schedule,
  type CardState,
  type Rating,
  type State,
} from "@/lib/fsrs";

const RATINGS: Rating[] = [1, 2, 3, 4];

/** A stored card's memory state, as the scheduler reads it. */
function cardState(card: Card): CardState {
  return {
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.fsrsState as State,
    lastReviewedAt: card.lastReviewedAt,
  };
}

/**
 * How long each grade (Again, Hard, Good, Easy) would put the card away for,
 * in milliseconds. The same scheduler gradeCard runs, so a label built from
 * it is the real outcome of pressing that grade.
 */
export function nextDueIn(card: Card, now: Date): number[] {
  return RATINGS.map(
    (rating) =>
      schedule(cardState(card), rating, now).dueAt.getTime() - now.getTime(),
  );
}

export async function gradeCard(ownerId: string, cardId: number, rating: Rating) {
  const db = await getDb();
  const owned = and(eq(cards.id, cardId), eq(cards.ownerId, ownerId));
  const card = await db.select().from(cards).where(owned).get();
  if (!card) {
    throw new Error("Card not found.");
  }

  const now = new Date();
  const next = schedule(cardState(card), rating, now);

  await db
    .update(cards)
    .set({
      stability: next.stability,
      difficulty: next.difficulty,
      scheduledDays: next.scheduledDays,
      reps: next.reps,
      lapses: next.lapses,
      fsrsState: next.state,
      dueAt: next.dueAt,
      lastReviewedAt: now,
    })
    .where(owned)
    .run();

  return next;
}
