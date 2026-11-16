import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractFromHtml,
  extractFromText,
  extractFromUrl,
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

describe("extractFromUrl", () => {
  const page = "<html><body><div>tiny page</div></body></html>";
  const html = (status = 200) =>
    new Response(page, { status, headers: { "content-type": "text/html" } });
  const redirect = (location?: string) =>
    new Response(null, {
      status: 302,
      headers: location ? { location } : {},
    });
  const stubFetch = (...responses: Response[]) => {
    const fetchMock = vi.fn();
    responses.forEach((r) => fetchMock.mockResolvedValueOnce(r));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the page and extracts its text", async () => {
    const fetchMock = stubFetch(html());

    const doc = await extractFromUrl("https://example.com/a");

    expect(doc.text).toBe("tiny page");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://example.com/a",
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: "manual" });
  });

  it("rejects an unparseable URL", async () => {
    await expect(extractFromUrl("not a url")).rejects.toThrow(
      "Invalid URL: not a url",
    );
  });

  it("rejects a non-http scheme", async () => {
    await expect(extractFromUrl("ftp://example.com/a")).rejects.toThrow(
      "Only http and https URLs are supported (got ftp:): ftp://example.com/a",
    );
  });

  it("rejects a private host before fetching", async () => {
    const fetchMock = stubFetch();

    await expect(extractFromUrl("http://127.0.0.1/a")).rejects.toThrow(
      "Fetching private/internal addresses is not allowed: 127.0.0.1",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failing status with the URL that failed", async () => {
    stubFetch(html(500));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Failed to fetch https://example.com/a (500)",
    );
  });

  it("follows one relative redirect", async () => {
    const fetchMock = stubFetch(redirect("/b"), html());

    const doc = await extractFromUrl("https://example.com/a");

    expect(doc.text).toBe("tiny page");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });

  it("follows two redirects", async () => {
    const fetchMock = stubFetch(
      redirect("https://two.example/b"),
      redirect("/c"),
      html(),
    );

    const doc = await extractFromUrl("https://example.com/a");

    expect(doc.text).toBe("tiny page");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "https://example.com/a",
      "https://two.example/b",
      "https://two.example/c",
    ]);
  });

  it("stops at a third redirect", async () => {
    stubFetch(redirect("/b"), redirect("/c"), redirect("/d"));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Too many redirects fetching https://example.com/a",
    );
  });

  it("reports a failing status after a redirect with its URL", async () => {
    stubFetch(redirect("/b"), html(404));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Failed to fetch https://example.com/b (404)",
    );
  });

  it("reports a failing status after two redirects with the final URL", async () => {
    stubFetch(redirect("/b"), redirect("/c"), html(404));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Failed to fetch https://example.com/c (404)",
    );
  });

  it("rejects a first redirect with no Location header", async () => {
    stubFetch(redirect());

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Redirect from https://example.com/a had no Location header",
    );
  });

  it("rejects a second redirect with no Location header", async () => {
    stubFetch(redirect("/b"), redirect());

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Second redirect from https://example.com/b had no Location header",
    );
  });

  it("rejects a first redirect to an unparseable URL", async () => {
    stubFetch(redirect("http://[bad"));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Redirect to invalid URL: http://[bad",
    );
  });

  it("rejects a second redirect to an unparseable URL", async () => {
    stubFetch(redirect("/b"), redirect("http://[bad"));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Second redirect to invalid URL: http://[bad",
    );
  });

  it("blocks a first redirect to a non-http scheme", async () => {
    stubFetch(redirect("file:///etc/passwd"));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Redirect to non-HTTP(S) scheme blocked: file:",
    );
  });

  it("blocks a second redirect to a non-http scheme", async () => {
    stubFetch(redirect("/b"), redirect("file:///etc/passwd"));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Redirect to non-HTTP(S) scheme blocked: file:",
    );
  });

  it("blocks a first redirect to a private host", async () => {
    const fetchMock = stubFetch(redirect("http://169.254.169.254/latest"));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Redirect to private/internal address blocked: 169.254.169.254",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks a second redirect to a private host", async () => {
    const fetchMock = stubFetch(redirect("/b"), redirect("http://localhost/x"));

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "Redirect to private/internal address blocked: localhost",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a non-HTML reply, naming the URL that sent it", async () => {
    stubFetch(
      redirect("/b"),
      new Response("%PDF", { headers: { "content-type": "application/pdf" } }),
    );

    await expect(extractFromUrl("https://example.com/a")).rejects.toThrow(
      "URL returned non-HTML content-type (application/pdf): https://example.com/b",
    );
  });
});
