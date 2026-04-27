import { describe, expect, it } from "vitest";
import {
  extractFromHtml,
  extractFromText,
  looksLikeUrl,
} from "@/lib/extract/url";

describe("looksLikeUrl", () => {
  it("accepts http and https URLs", () => {
    expect(looksLikeUrl("https://example.com/foo")).toBe(true);
    expect(looksLikeUrl("http://example.com")).toBe(true);
  });

  it("rejects plain text and other schemes", () => {
    expect(looksLikeUrl("just some text")).toBe(false);
    expect(looksLikeUrl("ftp://example.com")).toBe(false);
    expect(looksLikeUrl("javascript:alert(1)")).toBe(false);
    expect(looksLikeUrl("")).toBe(false);
  });
});

describe("extractFromHtml", () => {
  it("pulls title and main content via Readability", () => {
    const html = `
      <html>
        <head><title>Distribution moats</title></head>
        <body>
          <article>
            <h1>Distribution moats</h1>
            <p>The first claim of the essay is that distribution outlasts data moats in the LLM era. Distribution is hard to build but harder to displace, while data moats erode as foundation models commoditize.</p>
            <p>The second claim builds on the first: founders should optimize for distribution channels they own.</p>
          </article>
        </body>
      </html>`;
    const result = extractFromHtml(html, "https://example.com/post");
    expect(result.title.toLowerCase()).toContain("distribution");
    expect(result.text.toLowerCase()).toContain("distribution outlasts data moats");
    expect(result.excerpt.length).toBeGreaterThan(20);
  });

  it("falls back to stripped text when Readability finds nothing", () => {
    const html = "<div>tiny</div>";
    const result = extractFromHtml(html);
    expect(result.text.toLowerCase()).toContain("tiny");
    expect(result.title.length).toBeGreaterThan(0);
  });
});

describe("extractFromText", () => {
  it("derives a title from the first non-empty line", () => {
    const result = extractFromText("On competitive moats\n\nThis is the body of the note.");
    expect(result.title).toBe("On competitive moats");
    expect(result.text).toContain("body of the note");
  });

  it("returns Untitled for empty input", () => {
    const result = extractFromText("   ");
    expect(result.title).toBe("Untitled");
  });

  it("truncates very long inputs", () => {
    const large = "x".repeat(200_000);
    const result = extractFromText(large);
    expect(result.text.length).toBeLessThanOrEqual(60_000);
  });
});
