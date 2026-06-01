import { describe, expect, it, vi } from "vitest";
import {
  buildExportUrl,
  highlightToCapture,
  ReadwiseSource,
} from "@/lib/services/integrations/readwise";
import { InvalidTokenError } from "@/lib/services/ingest-source";

/**
 * Build a fetch stub that returns the given response objects in order.
 * Each entry is either a `Response` or `() => Response` so per-call control
 * is possible (e.g. first call 429, second 200).
 */
function makeFetchStub(
  responses: Array<Response | (() => Response | Promise<Response>)>,
): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const next = responses[i++];
    if (!next) throw new Error(`fetch stub: unexpected call #${i}`);
    return typeof next === "function" ? await next() : next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const SAMPLE_PAGE_1 = {
  count: 2,
  next_page_cursor: "cursor-abc",
  results: [
    {
      user_book_id: 100,
      title: "Distribution outlasts data",
      source_url: "https://example.com/distribution",
      highlights: [
        {
          id: 1,
          text: "The data layer commoditizes; the distribution layer compounds.",
          note: "Reread this when picking a moat.",
          url: "https://readwise.io/h/1",
          highlighted_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-15T10:00:00Z",
        },
        {
          id: 2,
          text: "Brand sits underneath all three.",
          note: null,
          url: null,
          highlighted_at: "2026-05-02T10:00:00Z",
          updated_at: null,
        },
      ],
    },
  ],
};

const SAMPLE_PAGE_2 = {
  count: 1,
  next_page_cursor: null,
  results: [
    {
      user_book_id: 101,
      title: "Network effects",
      source_url: null,
      highlights: [
        {
          id: 3,
          text: "Network effects degrade when switching costs collapse.",
          note: undefined,
          url: undefined,
          highlighted_at: "2026-05-03T10:00:00Z",
          updated_at: "2026-05-03T10:00:00Z",
        },
      ],
    },
  ],
};

describe("buildExportUrl", () => {
  it("formats updatedAfter as an ISO string", () => {
    const url = buildExportUrl(new Date("2026-05-01T00:00:00Z"));
    expect(url).toContain("updatedAfter=2026-05-01T00%3A00%3A00.000Z");
  });

  it("omits updatedAfter when no cursor is provided and includes pageCursor", () => {
    const url = buildExportUrl(undefined, "abc-123");
    expect(url).not.toContain("updatedAfter");
    expect(url).toContain("pageCursor=abc-123");
  });
});

describe("highlightToCapture", () => {
  it("merges highlight text + user note with a separator", () => {
    const cap = highlightToCapture(SAMPLE_PAGE_1.results[0], SAMPLE_PAGE_1.results[0].highlights[0]);
    expect(cap.externalId).toBe("1");
    expect(cap.title).toBe("Distribution outlasts data");
    expect(cap.text).toContain("commoditizes");
    expect(cap.text).toContain("Note: Reread this");
    expect(cap.url).toBe("https://readwise.io/h/1");
    expect(cap.externalUpdatedAt?.toISOString()).toBe("2026-05-15T10:00:00.000Z");
  });

  it("falls back from highlight.url to book.source_url and skips the note when absent", () => {
    const cap = highlightToCapture(SAMPLE_PAGE_1.results[0], SAMPLE_PAGE_1.results[0].highlights[1]);
    expect(cap.url).toBe("https://example.com/distribution");
    expect(cap.text).not.toContain("Note:");
  });
});

describe("ReadwiseSource.fetchNew", () => {
  it("parses one page of Readwise export correctly", async () => {
    const { fetch, calls } = makeFetchStub([jsonResponse({ ...SAMPLE_PAGE_1, next_page_cursor: null })]);
    const source = new ReadwiseSource(fetch);
    const captures = [];
    for await (const c of source.fetchNew("tok")) captures.push(c);
    expect(captures).toHaveLength(2);
    expect(captures[0].externalId).toBe("1");
    expect(captures[1].externalId).toBe("2");
    expect(calls[0]).toContain("https://readwise.io/api/v2/export/");
  });

  it("advances the pagination cursor across pages", async () => {
    const { fetch, calls } = makeFetchStub([
      jsonResponse(SAMPLE_PAGE_1),
      jsonResponse(SAMPLE_PAGE_2),
    ]);
    const source = new ReadwiseSource(fetch);
    const captures = [];
    for await (const c of source.fetchNew("tok")) captures.push(c);
    expect(captures).toHaveLength(3);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("pageCursor=cursor-abc");
  });

  it("throws InvalidTokenError on 401", async () => {
    const { fetch } = makeFetchStub([
      new Response("Unauthorized", { status: 401 }),
    ]);
    const source = new ReadwiseSource(fetch);
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of source.fetchNew("bad")) {
        // unreachable
      }
    }).rejects.toThrow(InvalidTokenError);
  });

  it("retries once on 429 then yields successfully", async () => {
    const { fetch, calls } = makeFetchStub([
      new Response("rate limited", {
        status: 429,
        headers: { "Retry-After": "1" },
      }),
      jsonResponse({ ...SAMPLE_PAGE_1, next_page_cursor: null }),
    ]);
    const source = new ReadwiseSource(fetch);
    const captures = [];
    for await (const c of source.fetchNew("tok")) captures.push(c);
    expect(captures).toHaveLength(2);
    expect(calls).toHaveLength(2);
  });

  it("yields every highlight across nested books", async () => {
    const fancyPage = {
      count: 4,
      next_page_cursor: null,
      results: [
        {
          user_book_id: 1,
          title: "Book A",
          highlights: [
            { id: 10, text: "a1" },
            { id: 11, text: "a2" },
          ],
        },
        {
          user_book_id: 2,
          title: "Book B",
          highlights: [
            { id: 20, text: "b1" },
            { id: 21, text: "b2" },
          ],
        },
      ],
    };
    const { fetch } = makeFetchStub([jsonResponse(fancyPage)]);
    const source = new ReadwiseSource(fetch);
    const ids: string[] = [];
    for await (const c of source.fetchNew("tok")) ids.push(c.externalId);
    expect(ids).toEqual(["10", "11", "20", "21"]);
  });

  it("passes updatedAfter through as ISO when sinceCursor is supplied", async () => {
    const { fetch, calls } = makeFetchStub([
      jsonResponse({ ...SAMPLE_PAGE_1, next_page_cursor: null }),
    ]);
    const source = new ReadwiseSource(fetch);
    const cursor = new Date("2026-05-10T12:34:56Z");
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of source.fetchNew("tok", cursor)) {
      // exhaust generator
    }
    expect(calls[0]).toContain("updatedAfter=2026-05-10T12%3A34%3A56.000Z");
  });
});
