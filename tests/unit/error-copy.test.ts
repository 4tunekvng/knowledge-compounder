import { describe, expect, it } from "vitest";
import { captureErrorCopy, failureReason } from "@/lib/error-copy";

describe("captureErrorCopy", () => {
  it("turns a fetch failure into plain words", () => {
    expect(captureErrorCopy("Failed to extract content: fetch failed", "url"))
      .toBe("Couldn't open that link. Check the address or paste the text instead.");
  });

  it("explains a link that is not a web page", () => {
    expect(
      captureErrorCopy(
        "Failed to extract content: URL returned non-HTML content-type (image/png)",
        "url",
      ),
    ).toMatch(/isn't a web page/);
  });

  it("never repeats the raw text", () => {
    expect(captureErrorCopy("Failed to fetch https://10.0.0.1/x (503)", "url"))
      .not.toContain("10.0.0.1");
  });

  it("explains a PDF with no readable text", () => {
    expect(captureErrorCopy("Failed to extract content: no text", "pdf"))
      .toMatch(/Couldn't read any text in that PDF/);
  });
});

describe("failureReason", () => {
  it("names an answer in the wrong shape", () => {
    expect(failureReason("Failed to parse structured output: too_big"))
      .toMatch(/came back in a shape/);
  });

  it("names a refused request without the provider's text", () => {
    const reason = failureReason("403 Forbidden from https://gw.internal key=abc");
    expect(reason).toBe("The AI model turned the request down.");
  });

  it("names the background give-up", () => {
    expect(failureReason("Gave up after 3 attempts.")).toMatch(/three times/);
  });

  it("falls back to a general reason", () => {
    expect(failureReason(null))
      .toBe("Something went wrong while writing its note and flashcards.");
  });
});
