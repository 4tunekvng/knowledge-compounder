import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";
import { schedule, type Rating, type State } from "@/lib/sm2";

export function gradeCard(cardId: number, rating: Rating) {
  const db = getDb();
  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
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

  db.update(cards)
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

  return next;
}
