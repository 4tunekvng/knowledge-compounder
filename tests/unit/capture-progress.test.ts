import { describe, expect, it, vi } from "vitest";

/**
 * The capture route's progress stream: the page hears that a capture is
 * saved as soon as it is, before the slow step of writing its notes, and
 * hears a plain message, never a raw error, when something fails.
 */

const ingest = vi.fn();
vi.mock("@/lib/services/ingest", () => ({
  ingest,
  ingestPdf: vi.fn(),
  MAX_PDF_BYTES: 10,
}));
vi.mock("@/lib/auth/user", () => ({
  apiUser: () => ({ id: "u1", email: "", name: "", picture: "" }),
  unauthorized: () => new Response(null, { status: 401 }),
}));

const { POST } = await import("@/app/api/capture/route");

const capture = (path: string) =>
  POST(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: "https://example.com/post" }),
    }),
  );

const lines = async (res: Response) =>
  (await res.text())
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));

describe("POST /api/capture?progress=1", () => {
  it("says the capture is filed before it says it is done", async () => {
    // Arrange
    ingest.mockImplementation(async ({ onFiled }) => {
      onFiled({ sourceId: 12, title: "A post", chars: 4200 });
      return { sourceId: 12, status: "processed" };
    });

    // Act
    const events = await lines(await capture("/api/capture?progress=1"));

    // Assert
    expect(events).toEqual([
      { stage: "filed", sourceId: 12, title: "A post", chars: 4200 },
      { stage: "done", sourceId: 12, status: "processed" },
    ]);
  });

  it("ends with a plain message when the link can't be read", async () => {
    // Arrange
    ingest.mockRejectedValue(new Error("Failed to extract content: fetch failed"));

    // Act
    const events = await lines(await capture("/api/capture?progress=1"));

    // Assert
    expect(events).toEqual([
      {
        stage: "error",
        status: 422,
        error:
          "Couldn't open that link. Check the address or paste the text instead.",
      },
    ]);
  });

  it("answers in one JSON reply without the flag", async () => {
    // Arrange
    ingest.mockResolvedValue({ sourceId: 3, status: "processed" });

    // Act
    const res = await capture("/api/capture");

    // Assert
    expect(await res.json()).toEqual({ sourceId: 3, status: "processed" });
  });
});
