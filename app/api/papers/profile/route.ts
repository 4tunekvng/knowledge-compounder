import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { saveInterests } from "@/lib/papers/readers";

export const runtime = "nodejs";

// Long enough for a paragraph of interests; the model call stays small.
const MAX_INTERESTS = 2000;

/** Save the signed-in person's interest text; picks are re-ranked at once. */
export async function POST(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as {
    interests?: unknown;
  } | null;
  const interests = typeof body?.interests === "string" ? body.interests.trim() : "";
  if (!interests) {
    return NextResponse.json(
      { error: "Write a few interests first." },
      { status: 400 },
    );
  }
  if (interests.length > MAX_INTERESTS) {
    return NextResponse.json(
      { error: `Keep it under ${MAX_INTERESTS} characters.` },
      { status: 400 },
    );
  }
  try {
    await saveInterests(user.id, interests);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[papers] saveInterests failed:", err);
    return NextResponse.json(
      { error: "Could not save. Try again." },
      { status: 500 },
    );
  }
}
