import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { type EventKind, recordEvent } from "@/lib/papers/readers";

export const runtime = "nodejs";

const KINDS: readonly EventKind[] = ["more", "less", "save", "open"];
const ARXIV_ID = /^\d{4}\.\d{4,5}$/;

/** Record "more", "less", "save" or "open" on one paper for the signed-in person. */
export async function POST(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  const body = (await request.json().catch(() => null)) as {
    arxivId?: unknown;
    kind?: unknown;
  } | null;
  const arxivId = typeof body?.arxivId === "string" ? body.arxivId : "";
  const kind = KINDS.find((k) => k === body?.kind);
  if (!ARXIV_ID.test(arxivId) || !kind) {
    return NextResponse.json({ error: "Unknown paper or action." }, { status: 400 });
  }
  try {
    await recordEvent(user.id, arxivId, kind);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[papers] recordEvent failed:", err);
    return NextResponse.json(
      { error: "Could not save. Try again." },
      { status: 500 },
    );
  }
}
