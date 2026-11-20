import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { deepRead } from "@/lib/papers/readers";

export const runtime = "nodejs";

const ARXIV_ID = /^\d{4}\.\d{4,5}$/;

/** File a paper in the signed-in person's library and make it an Anki-ready deck. */
export async function POST(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as {
    arxivId?: unknown;
  } | null;
  const arxivId = typeof body?.arxivId === "string" ? body.arxivId : "";
  if (!ARXIV_ID.test(arxivId)) {
    return NextResponse.json({ error: "Unknown paper." }, { status: 400 });
  }
  try {
    const result = await deepRead(user.id, arxivId);
    if (!result) {
      return NextResponse.json({ error: "Unknown paper." }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("[papers] deepRead failed:", err);
    return NextResponse.json(
      { error: "Could not save. Try again." },
      { status: 500 },
    );
  }
}
