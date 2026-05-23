import { NextResponse } from "next/server";
import { gradeCard } from "@/lib/services/review";
import type { Rating } from "@/lib/sm2";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { cardId?: number; grade?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const cardId = Number(body.cardId);
  const ratingValue = Number(body.grade);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return NextResponse.json({ error: "Invalid cardId." }, { status: 400 });
  }
  // FSRS ratings: 1=Again 2=Hard 3=Good 4=Easy
  if (!Number.isInteger(ratingValue) || ratingValue < 1 || ratingValue > 4) {
    return NextResponse.json(
      { error: "Grade must be an integer between 1 and 4 (Again/Hard/Good/Easy)." },
      { status: 400 },
    );
  }

  try {
    const next = await gradeCard(cardId, ratingValue as Rating);
    return NextResponse.json({
      stability: next.stability,
      difficulty: next.difficulty,
      scheduledDays: next.scheduledDays,
      reps: next.reps,
      lapses: next.lapses,
      state: next.state,
      dueAt: next.dueAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    const status = message === "Card not found." ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
