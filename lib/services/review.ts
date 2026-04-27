import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { cards } from "@/lib/db/schema";
import { schedule, type Grade } from "@/lib/sm2";

export function gradeCard(cardId: number, grade: Grade) {
  const db = getDb();
  const card = db.select().from(cards).where(eq(cards.id, cardId)).get();
  if (!card) {
    throw new Error("Card not found.");
  }
  const next = schedule({
    ease: card.ease,
    intervalDays: card.intervalDays,
    repetitions: card.repetitions,
    grade,
  });
  db.update(cards)
    .set({
      ease: next.ease,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      dueAt: next.dueAt,
      lastReviewedAt: new Date(),
    })
    .where(eq(cards.id, cardId))
    .run();
  return next;
}
