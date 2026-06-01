import { NextResponse } from "next/server";
import { deleteDeck } from "@/lib/services/decks";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid deck id." }, { status: 400 });
  }
  try {
    const ok = await deleteDeck(id);
    if (!ok) {
      return NextResponse.json({ error: "Deck not found." }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[decks/delete] deleteDeck failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
