import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/lib/markdown";

describe("renderMarkdown", () => {
  it("renders headings", () => {
    const html = renderMarkdown("# Big\n## Smaller\n### Smallest");
    expect(html).toContain("<h1>Big</h1>");
    expect(html).toContain("<h2>Smaller</h2>");
    expect(html).toContain("<h3>Smallest</h3>");
  });

  it("renders unordered lists", () => {
    const html = renderMarkdown("- one\n- two\n- three");
    expect(html).toContain("<ul>");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
    expect(html).toContain("<li>three</li>");
  });

  it("renders bold and italic spans", () => {
    const html = renderMarkdown("Plain **bold** and *italic* prose.");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("renders footnote refs and definitions", () => {
    const html = renderMarkdown(
      "A claim with a footnote.[^1]\n\n[^1]: The supporting source.",
    );
    expect(html).toContain('<sup><a href="#fn-1">1</a></sup>');
    expect(html).toContain('id="fn-1"');
  });

  it("escapes HTML in user content", () => {
    const html = renderMarkdown("Try <script>alert('x')</script> now");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
