import { describe, expect, it } from "vitest";
import {
  cardTypeLabel,
  catalogNumber,
  countLabel,
  displayTitle,
  essayHeading,
  formatInterval,
  hostOf,
  originLabel,
} from "@/lib/format";

const MINUTE = 60_000;
const DAY = 86_400_000;

describe("format", () => {
  it("numbers a capture like a call number", () => {
    expect(catalogNumber(11)).toBe("No. 11");
  });

  it("names a card type as a label", () => {
    expect(cardTypeLabel("application")).toBe("Application");
  });

  it("uses the singular for one", () => {
    expect(countLabel(1, "card")).toBe("1 card");
  });

  it("uses the plural for zero", () => {
    expect(countLabel(0, "card")).toBe("0 cards");
  });

  it("rounds a short wait up to one minute", () => {
    expect(formatInterval(10_000)).toBe("in 1 minute");
  });

  it("says minutes under an hour", () => {
    expect(formatInterval(10 * MINUTE)).toBe("in 10 minutes");
  });

  it("says hours under a day", () => {
    expect(formatInterval(5 * 60 * MINUTE)).toBe("in 5 hours");
  });

  it("says days under a month", () => {
    expect(formatInterval(3 * DAY)).toBe("in 3 days");
  });

  it("says months under a year", () => {
    expect(formatInterval(95 * DAY)).toBe("in 3 months");
  });

  it("says years past a year", () => {
    expect(formatInterval(800 * DAY)).toBe("in 2 years");
  });

  it("drops www from a link's host", () => {
    expect(hostOf("https://www.example.com/a/b?c=1")).toBe("example.com");
  });

  it("keeps text that is not a link as it is", () => {
    expect(hostOf("not a link")).toBe("not a link");
  });

  it("names a capture with a link by its host", () => {
    expect(originLabel({ url: "https://worldmodels.github.io/", sourceType: "url" }))
      .toBe("worldmodels.github.io");
  });

  it("names a PDF capture", () => {
    expect(originLabel({ url: null, sourceType: "pdf" })).toBe("PDF");
  });

  it("names pasted text", () => {
    expect(originLabel({ url: null, sourceType: "text" })).toBe("Pasted text");
  });
});

describe("displayTitle", () => {
  it("keeps a short title as it is", () => {
    expect(displayTitle("Thinking, Fast and Slow")).toBe("Thinking, Fast and Slow");
  });

  it("uses the first sentence of pasted text, without its full stop", () => {
    expect(displayTitle("Habits compound. Small ones matter most over years."))
      .toBe("Habits compound");
  });

  it("does not split at an abbreviation", () => {
    expect(displayTitle("The U.S. Senate passed it. Then it stalled."))
      .toBe("The U.S. Senate passed it");
  });

  it("shows a link as its site", () => {
    expect(displayTitle("read later https://www.example.org/posts/42?ref=x"))
      .toBe("read later example.org");
  });

  it("drops a word cut off by the stored title limit", () => {
    const stored = `${"word ".repeat(23)}unfinis`;
    expect(displayTitle(stored)).toBe(`${"word ".repeat(22)}word…`);
  });

  it("cuts a long title at a word, never inside one", () => {
    expect(displayTitle("alpha beta gamma delta epsilon", 14)).toBe("alpha beta…");
  });
});

describe("essayHeading", () => {
  it("names the theme the essay was drafted from", () => {
    expect(essayHeading("Notes toward a thesis", "Habits compound"))
      .toBe("Draft: Habits compound");
  });

  it("falls back to the drafter's title when the theme is gone", () => {
    expect(essayHeading("Why habits compound", null)).toBe("Why habits compound");
  });
});
