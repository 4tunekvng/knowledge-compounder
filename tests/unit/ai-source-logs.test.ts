import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Every AI answer says in the logs where it came from: the model, the test
 * stub, or (for embeddings) the word-count fallback used when Voyage is
 * unavailable. A stand-in must never pass for the real thing.
 */

vi.mock("@/lib/db/client", () => ({ getEnv: async () => ({}) }));

const { processSource } = await import("@/lib/ai/process");
const { embed } = await import("@/lib/embeddings/client");

const logged = () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  return () => log.mock.calls.map((args) => String(args[0]));
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("where an AI answer came from", () => {
  it("logs a test-mode reply as the stub", async () => {
    // Arrange
    vi.stubEnv("USE_FAKE_AI", "1");
    const lines = logged();

    // Act
    await processSource({ title: "Moats", text: "Distribution wins." });

    // Assert
    expect(lines()).toContain("[ai] Processing source=test-stub");
  });

  it("logs an embedding made without Voyage as the fallback", async () => {
    // Arrange
    vi.stubEnv("VOYAGE_API_KEY", "");
    const lines = logged();

    // Act
    await embed("Distribution outlasts data moats.");

    // Assert
    expect(lines()).toContain("[embed] source=lexical-fallback");
  });
});
