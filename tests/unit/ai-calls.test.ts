import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the request each lib/ai call sends to the Anthropic SDK, how it reads
 * the parsed reply, and that it always closes its per-call client. The SDK
 * and the environment lookup are mocked at the module boundary.
 */

const parse = vi.fn();
const close = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { parse };
    close = close;
  },
}));

vi.mock("@/lib/db/client", () => ({
  getEnv: async () => ({ ANTHROPIC_API_KEY: "test-key" }),
}));

const { processSource } = await import("@/lib/ai/process");
const { findThemes } = await import("@/lib/ai/themes");
const { draftEssay } = await import("@/lib/ai/essay");
const { generateMoreCards } = await import("@/lib/ai/more-cards");

const card = { type: "definition", front: "Q?", back: "A." };

const CASES = [
  {
    name: "processSource",
    call: () => processSource({ title: "Moats", text: "body text" }),
    model: "claude-sonnet-5-5",
    maxTokens: 8192,
    effort: "medium",
    label: "Processing",
    reply: {
      why_i_cared: "w",
      key_takeaways: ["t"],
      cards: [card],
      concepts: [{ name: "data", weight: 0.5 }],
    },
    userSnippet: "Title: Moats",
  },
  {
    name: "findThemes",
    call: () =>
      findThemes([
        { id: 7, title: "Moats", concepts: [{ name: "data" }], whyICared: "x" },
      ]),
    model: "claude-sonnet-5-5",
    maxTokens: 4096,
    effort: "medium",
    label: "Themes",
    reply: { themes: [{ label: "l", summary: "s", source_ids: [7] }] },
    userSnippet: '- Source 7: "Moats"',
  },
  {
    name: "draftEssay",
    call: () =>
      draftEssay({
        themeLabel: "Moats erode",
        themeSummary: "summary",
        sources: [{ id: 3, title: "Moats", excerpt: "e", whyICared: "w" }],
      }),
    model: "claude-opus-5-5",
    maxTokens: 12_000,
    effort: "xhigh",
    label: "Essay",
    reply: { title: "t", draft_md: "d", citations: [] },
    userSnippet: "Label: Moats erode",
  },
  {
    name: "generateMoreCards",
    call: () =>
      generateMoreCards({ title: "Moats", text: "t", existingFronts: ["Q?"] }),
    model: "claude-sonnet-5-5",
    maxTokens: 4096,
    effort: "medium",
    label: "More-cards",
    reply: { cards: [card] },
    userSnippet: "- Q?",
  },
];

describe("lib/ai calls", () => {
  beforeEach(() => {
    parse.mockReset();
    close.mockReset();
  });

  it.each(CASES)("$name sends a cached, structured request", async (c) => {
    parse.mockResolvedValue({ parsed_output: c.reply });

    const result = await c.call();

    expect(result).toEqual(c.reply);
    const request = parse.mock.calls[0][0];
    expect(request).toMatchObject({
      model: c.model,
      max_tokens: c.maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort: c.effort },
      system: [
        { type: "text", cache_control: { type: "ephemeral" } },
      ],
      messages: [
        { role: "user", content: expect.stringContaining(c.userSnippet) },
      ],
    });
    expect(request.output_config.format).toBeDefined();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each(CASES)("$name throws and still closes on no parsed output", async (c) => {
    parse.mockResolvedValue({ parsed_output: null, stop_reason: "max_tokens" });

    const outcome = c.call();

    await expect(outcome).rejects.toThrow(
      `${c.label} returned no parsed output (stop_reason=max_tokens)`,
    );
    // Tried twice, and each try's client closed.
    expect(parse).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it.each(CASES)("$name retries once past a bad reply", async (c) => {
    parse
      .mockResolvedValueOnce({ parsed_output: null, stop_reason: "end_turn" })
      .mockResolvedValueOnce({ parsed_output: c.reply });

    const result = await c.call();

    expect(result).toEqual(c.reply);
    // The retry asks the gateway not to answer from its cache.
    expect(parse.mock.calls[1][0].metadata).toEqual({ fortune_no_cache: true });
  });

  it("does not retry a rejected key", async () => {
    parse.mockRejectedValue(Object.assign(new Error("401"), { status: 401 }));

    const outcome = processSource({ title: "Moats", text: "body text" });

    await expect(outcome).rejects.toThrow("401");
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
