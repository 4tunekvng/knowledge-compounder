import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// A processing failure's raw text (gateway host, SDK error body) must not
// reach the source page, even for the person who owns it; the row keeps it.
const RAW_ERROR = "401 from https://gateway.internal key=sk-fake-secret";

vi.mock("@/lib/services/queries", () => ({
  getSourceDetail: async () => ({
    source: {
      id: 7,
      title: "A failed source",
      url: null,
      status: "failed",
      errorMessage: RAW_ERROR,
      rawContent: "captured text",
    },
    processing: null,
    cards: [],
    related: [],
  }),
  parseTakeaways: () => [],
  parseConcepts: () => [],
}));
vi.mock("@/lib/auth/user", () => ({
  requireUser: async () => ({ id: "owner-1", email: "", name: "", picture: "" }),
}));
vi.mock("@/components/RetrySourceButton", () => ({ RetrySourceButton: () => null }));
vi.mock("@/components/GenerateCardsButton", () => ({
  GenerateCardsButton: () => null,
}));

const { default: SourcePage } = await import("@/app/sources/[id]/page");

describe("source page", () => {
  it("shows a fixed failure message, not the stored raw error", async () => {
    // Arrange
    const params = Promise.resolve({ id: "7" });

    // Act
    const html = renderToStaticMarkup(await SourcePage({ params }));

    // Assert
    expect(html).toContain("Processing failed");
    expect(html).not.toContain("sk-fake-secret");
  });
});
