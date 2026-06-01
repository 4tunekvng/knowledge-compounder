import { NextResponse } from "next/server";
import { createDeck } from "@/lib/services/decks";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const obj = body as Record<string, unknown>;

  const title = typeof obj.title === "string" ? obj.title : "";
  const description = typeof obj.description === "string" ? obj.description : undefined;
  const rawIds = Array.isArray(obj.sourceIds) ? obj.sourceIds : [];
  const sourceIds = rawIds
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  try {
    const deck = await createDeck({ title, description, sourceIds });
    return NextResponse.json({ deck });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    if (
      message.startsWith("Deck title") ||
      message.startsWith("Select at least") ||
      message.startsWith("None of the selected")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[decks] createDeck failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
