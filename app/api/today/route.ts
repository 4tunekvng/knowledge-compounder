import { NextResponse } from "next/server";
import { apiUser } from "@/lib/auth/user";
import { todayFor } from "@/lib/services/today";

// GET /api/today: what the Today page at https://fortuneking.dev shows for
// this person. The gate (lib/auth/gate.ts) adds the cross-site headers.
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = apiUser(request);
  if (!user) {
    return NextResponse.json({ error: "signed out" }, { status: 401 });
  }
  try {
    return NextResponse.json(await todayFor(user.id));
  } catch (err) {
    console.error("[today] failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
