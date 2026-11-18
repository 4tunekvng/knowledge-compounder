import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { toWinAnsi } from "@/lib/pdf-text";

const helvetica = async () =>
  (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);

describe("toWinAnsi", () => {
  it("makes text with stray control characters encodable", async () => {
    const font = await helvetica();
    const text = toWinAnsi("\u0093entropy\u0094 \u0000bits\u007f");

    expect(() => font.encodeText(text)).not.toThrow();
  });

  it("turns control characters into spaces and keeps newlines", () => {
    expect(toWinAnsi("a\u0093b\tc\nd")).toBe("a b c\nd");
  });

  it("still maps smart punctuation", () => {
    expect(toWinAnsi("“hi” — ok…")).toBe('"hi" - ok...');
  });
});
