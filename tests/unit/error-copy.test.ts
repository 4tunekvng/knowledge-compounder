import { describe, expect, it } from "vitest";
import { captureErrorCopy, failureReason } from "@/lib/error-copy";

describe("captureErrorCopy", () => {
  it("turns a link that won't open into plain words", () => {
    expect(captureErrorCopy("cannot-open"))
      .toBe("Couldn't open that link. Check the address or paste the text instead.");
  });

  it("explains a link that is not a web page", () => {
    expect(captureErrorCopy("not-web-page")).toMatch(/isn't a web page/);
  });

  it("explains a private network address", () => {
    expect(captureErrorCopy("private-address")).toMatch(/private network address/);
  });

  it("explains a PDF with no readable text", () => {
    expect(captureErrorCopy("pdf-no-text"))
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
