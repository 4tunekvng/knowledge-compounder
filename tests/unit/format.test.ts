import { describe, expect, it } from "vitest";
import {
  cardTypeLabel,
  catalogNumber,
  countLabel,
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
