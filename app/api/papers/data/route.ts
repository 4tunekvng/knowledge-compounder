import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { deleteReadingData } from "@/lib/papers/readers";

export const runtime = "nodejs";

/** "Delete my reading data": the signed-in person's interests, clicks and picks. */
export async function DELETE(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  try {
    await deleteReadingData(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[papers] deleteReadingData failed:", err);
    return NextResponse.json(
      { error: "Could not delete. Try again." },
      { status: 500 },
    );
  }
}
