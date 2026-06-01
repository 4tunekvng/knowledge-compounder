import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { getDeckByToken, type DeckWithCards } from "@/lib/services/decks";

export const runtime = "nodejs";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;
const MAX_W = PAGE_W - MARGIN * 2;
const ACCENT = rgb(0.52, 0.3, 0.16);
const INK = rgb(0.13, 0.12, 0.1);
const MUTE = rgb(0.45, 0.43, 0.4);

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const deck = await getDeckByToken(token);
  if (!deck) {
    return new Response("Deck not found.", { status: 404 });
  }

  const bytes = await buildPdf(deck);
  return new Response(bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileSlug(deck.deck.title)}-study-guide.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

async function buildPdf(deck: DeckWithCards): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const layout = new Layout(doc);

  // Title block.
  layout.draw(deck.deck.title, { font: bold, size: 24, color: INK, gap: 4 });
  if (deck.deck.description) {
    layout.draw(deck.deck.description, { font, size: 11, color: MUTE, gap: 6 });
  }
  layout.draw(
    `${deck.cards.length} flashcards · Knowledge Compounder study guide`,
    { font: italic, size: 10, color: MUTE, gap: 16 },
  );

  if (deck.cards.length === 0) {
    layout.draw("This deck has no cards yet.", { font, size: 12, color: MUTE });
  }

  // Cards grouped by source.
  let lastSourceId: number | null = null;
  let n = 0;
  for (const card of deck.cards) {
    if (card.sourceId !== lastSourceId) {
      layout.space(8);
      layout.draw(card.sourceTitle, { font: bold, size: 13, color: ACCENT, gap: 8, keepWith: 60 });
      lastSourceId = card.sourceId;
    }
    n += 1;
    layout.draw(`${n}.  ${card.front}`, { font: bold, size: 12, color: INK, gap: 3, keepWith: 40 });
    layout.draw(card.back, { font, size: 11, color: INK, gap: 14, indent: 14 });
  }

  return doc.save();
}

interface DrawOpts {
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
  gap?: number;
  indent?: number;
  // If set, start a new page when fewer than this many points remain — keeps a
  // heading attached to the text that follows it.
  keepWith?: number;
}

class Layout {
  private page: PDFPage;
  private y: number;
  constructor(private doc: PDFDocument) {
    this.page = doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }
  private newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }
  space(pts: number) {
    this.y -= pts;
  }
  draw(text: string, opts: DrawOpts) {
    const indent = opts.indent ?? 0;
    const lineHeight = opts.size * 1.4;
    if (opts.keepWith && this.y - MARGIN < opts.keepWith) this.newPage();
    const lines = wrapText(toWinAnsi(text), opts.font, opts.size, MAX_W - indent);
    for (const line of lines) {
      if (this.y - lineHeight < MARGIN) this.newPage();
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y - opts.size,
        size: opts.size,
        font: opts.font,
        color: opts.color,
      });
      this.y -= lineHeight;
    }
    this.y -= opts.gap ?? 4;
  }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let cur = "";
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
        cur = trial;
        continue;
      }
      if (cur) out.push(cur);
      // Word itself longer than a line — hard-split by characters.
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const ch of word) {
          if (font.widthOfTextAtSize(chunk + ch, size) > maxWidth) {
            if (chunk) out.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        cur = chunk;
      } else {
        cur = word;
      }
    }
    if (cur) out.push(cur);
  }
  return out.length ? out : [""];
}

// StandardFonts use WinAnsi encoding and throw on characters outside it. Map
// the common smart-punctuation we actually see, then drop anything still
// outside Latin-1 so a PDF always renders.
function toWinAnsi(s: string): string {
  return s
    .replace(/[‘’‚‹›]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x00-\xFF]/g, "");
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
