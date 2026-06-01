import { getDeckByToken } from "@/lib/services/decks";

export const runtime = "nodejs";

// Export a deck as an Anki-importable CSV. Anki reads the leading #directives
// and imports Front / Back / Tags. Every field is RFC-4180 quoted, and newlines
// are collapsed so each card stays on one logical row.
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const deck = await getDeckByToken(token);
  if (!deck) {
    return new Response("Deck not found.", { status: 404 });
  }

  const lines: string[] = [
    "#separator:Comma",
    "#html:false",
    "#columns:Front,Back,Tags",
  ];
  const deckTag = slugTag(deck.deck.title);
  for (const card of deck.cards) {
    const tags = [deckTag, slugTag(card.sourceTitle), card.cardType]
      .filter(Boolean)
      .join(" ");
    lines.push(
      [csvField(card.front), csvField(card.back), csvField(tags)].join(","),
    );
  }
  const body = lines.join("\n") + "\n";

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileSlug(deck.deck.title)}-anki.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvField(s: string): string {
  const oneLine = s.replace(/\s*\n\s*/g, " ").trim();
  return `"${oneLine.replace(/"/g, '""')}"`;
}

// Anki tags can't contain spaces (spaces delimit tags), so collapse to a single
// underscore_token.
function slugTag(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function fileSlug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "deck"
  );
}
