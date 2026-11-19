import { describe, expect, it } from "vitest";
import { safeExternalHref } from "@/lib/safe-href";
import { parseHfDaily } from "@/lib/papers/feeds";
import { highlightToCapture } from "@/lib/services/integrations/readwise";

describe("safeExternalHref", () => {
  it("allows http and https URLs", () => {
    expect(safeExternalHref("https://example.com/a?x=1")).toBe("https://example.com/a?x=1");
    expect(safeExternalHref("http://example.com")).toBe("http://example.com/");
  });

  it("drops javascript:, data:, and malformed URLs", () => {
    expect(safeExternalHref("javascript:alert(1)")).toBeNull();
    expect(safeExternalHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeExternalHref("/relative/path")).toBeNull();
    expect(safeExternalHref(null)).toBeNull();
  });

  it("drops unsafe githubRepo and Readwise URLs during ingest", () => {
    const [paper] = parseHfDaily([
      {
        paper: {
          id: "2601.00001",
          title: "Safe paper",
          githubRepo: "javascript:alert(1)",
        },
      },
    ]);
    expect(paper?.githubUrl).toBeNull();

    const capture = highlightToCapture(
      { id: 1, title: "Book", source_url: "javascript:alert(1)" } as never,
      { id: 2, text: "Quote", url: "data:text/plain,bad" } as never,
    );
    expect(capture.url).toBeUndefined();
  });
});
