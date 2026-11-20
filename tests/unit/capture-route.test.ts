import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/capture through the real ingest and URL extractor, with fetch
 * stubbed: the status and copy a reader gets follow what went wrong, not
 * how the error message happens to be worded.
 */

vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));

const { POST } = await import("@/app/api/capture/route");

const USER = encodeURIComponent(JSON.stringify({ id: "owner-1" }));

function capture(input: string): Promise<Response> {
  return POST(
    new Request("https://kc.test/api/capture", {
      method: "POST",
      body: JSON.stringify({ input }),
      headers: { "content-type": "application/json", "x-kc-user": USER },
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/capture", () => {
  it("answers 502 when the linked site itself fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("oops", { status: 500 })),
    );

    const res = await capture("https://example.com/a");

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error:
        "Couldn't open that link. Check the address or paste the text instead.",
    });
  });

  it("answers 422 with plain copy for a private address", async () => {
    const res = await capture("http://127.0.0.1/a");

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "That link points to a private network address, so it can't be " +
        "opened from here. Paste the text instead.",
    });
  });

  it("answers 422 when the link is not a web page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("%PDF-", { headers: { "content-type": "application/pdf" } }),
      ),
    );

    const res = await capture("https://example.com/a.pdf");

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "That link isn't a web page. If it's a PDF, download it and use " +
        "Add a PDF.",
    });
  });

  it("answers 422 when the site cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("too large")));

    const res = await capture("https://example.com/a");

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "Couldn't open that link. Check the address or paste the text instead.",
    });
  });

  it("answers 422 with PDF copy for an unreadable PDF", async () => {
    const form = new FormData();
    form.set("file", new File(["%PDF-not really"], "x.pdf"));

    const res = await POST(
      new Request("https://kc.test/api/capture", {
        method: "POST",
        body: form,
        headers: { "x-kc-user": USER },
      }),
    );

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "Couldn't read any text in that PDF. It may be scanned pages rather " +
        "than text. Paste the text instead.",
    });
  });
});
