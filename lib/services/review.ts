import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards, reviewLogs } from "@/lib/db/schema";
import { schedule, type Rating, type State } from "@/lib/fsrs";

export async function gradeCard(cardId: number, rating: Rating) {
  const db = await getDb();
  const card = await db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card) {
    throw new Error("Card not found.");
  }

  const now = new Date();
  const next = schedule(
    {
      stability: card.stability,
      difficulty: card.difficulty,
      scheduledDays: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      state: card.fsrsState as State,
      lastReviewedAt: card.lastReviewedAt,
    },
    rating,
    now,
  );

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
    .where(eq(cards.id, cardId))
    .run();

  await db
    .insert(reviewLogs)
    .values({
      cardId,
      rating,
      reviewedAt: now,
      stateBefore: card.fsrsState,
      stabilityBefore: card.stability,
      difficultyBefore: card.difficulty,
      lastReviewedAtBefore: card.lastReviewedAt,
      stateAfter: next.state,
      stabilityAfter: next.stability,
      difficultyAfter: next.difficulty,
      scheduledDays: next.scheduledDays,
    })
    .run();

  return next;
}
