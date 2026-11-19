import { beforeAll, describe, expect, it, vi } from "vitest";

const findThemes = vi.fn();

vi.mock("@/lib/ai/themes", () => ({ findThemes }));
vi.mock("@/lib/services/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/queries")>()),
  getCorpusForThemes: async () => [
    { id: 1, title: "Moats", concepts: [], whyICared: "w" },
    { id: 2, title: "Distribution", concepts: [], whyICared: "w" },
  ],
}));

beforeAll(() => {
  process.env.DATABASE_PATH = ":memory:";
});

const summary = "A pattern that cuts across the captured sources in this corpus.";

describe("generateThemes", () => {
  // A theme must connect two distinct sources; a repeated id is still one.
  it("drops a theme whose source ids repeat a single source", async () => {
    findThemes.mockResolvedValue({
      themes: [
        { label: "Echo", summary, source_ids: [1, 1] },
        { label: "Real", summary, source_ids: [1, 2, 2] },
      ],
    });
    const { generateThemes } = await import("@/lib/services/themes");

    const inserted = await generateThemes("owner-1");

    expect(inserted.map((t) => t.label)).toEqual(["Real"]);
    expect(inserted[0]?.sourceIds).toBe("[1,2]");
  });
  it("keeps a valid sixth theme when the first five name one source", async () => {
    // Arrange
    const single = { summary, source_ids: [1] };
    findThemes.mockResolvedValue({
      themes: [
        ...["A", "B", "C", "D", "E"].map((label) => ({ ...single, label })),
        { label: "Sixth", summary, source_ids: [1, 2] },
      ],
    });
    const { generateThemes } = await import("@/lib/services/themes");

    // Act
    const inserted = await generateThemes("owner-1");

    // Assert
    expect(inserted.map((t) => t.label)).toEqual(["Sixth"]);
  });

  it("saves at most five valid themes", async () => {
    // Arrange
    findThemes.mockResolvedValue({
      themes: ["A", "B", "C", "D", "E", "F"].map((label) => ({
        label,
        summary,
        source_ids: [1, 2],
      })),
    });
    const { generateThemes } = await import("@/lib/services/themes");

    // Act
    const inserted = await generateThemes("owner-1");

    // Assert
    expect(inserted.map((t) => t.label)).toEqual(["A", "B", "C", "D", "E"]);
  });
});
