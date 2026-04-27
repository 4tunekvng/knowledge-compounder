import { NextResponse } from "next/server";
import { gradeCard } from "@/lib/services/review";
import type { Grade } from "@/lib/sm2";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { cardId?: number; grade?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const cardId = Number(body.cardId);
  const gradeValue = Number(body.grade);
  if (!Number.isInteger(cardId) || cardId <= 0) {
    return NextResponse.json({ error: "Invalid cardId." }, { status: 400 });
  }
  if (
    !Number.isInteger(gradeValue) ||
    gradeValue < 0 ||
    gradeValue > 5
  ) {
    return NextResponse.json(
      { error: "Grade must be an integer between 0 and 5." },
      { status: 400 },
    );
  }

  try {
    const next = gradeCard(cardId, gradeValue as Grade);
    return NextResponse.json({
      ease: next.ease,
      intervalDays: next.intervalDays,
      repetitions: next.repetitions,
      dueAt: next.dueAt.toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
