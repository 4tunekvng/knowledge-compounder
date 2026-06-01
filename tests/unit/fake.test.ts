import { describe, expect, it } from "vitest";
import { fakeEssay, fakeMoreCards, fakeProcessing, fakeThemes } from "@/lib/ai/fake";
import {
  AdditionalCardsResultSchema,
  EssayResultSchema,
  ProcessingResultSchema,
  ThemesResultSchema,
} from "@/lib/ai/schemas";

const SAMPLE = `Distribution moats outlast data moats in the LLM era. The data layer commoditizes;
the distribution layer compounds. Founders who optimize for owned channels — newsletter,
podcast, community — will win the next decade. Those who lean on proprietary data alone
will be flattened by the next foundation-model release.`;

describe("fake AI generators", () => {
  it("fakeProcessing emits schema-valid output with a scaled card set", () => {
    const output = fakeProcessing("Distribution outlasts data", SAMPLE);
    const result = ProcessingResultSchema.safeParse(output);
    expect(result.success).toBe(true);
    // "More flashcards": at least 4, and all three card kinds represented.
    expect(output.cards.length).toBeGreaterThanOrEqual(4);
    const types = new Set(output.cards.map((c) => c.type));
    expect(types).toContain("definition");
    expect(types).toContain("mechanism");
    expect(types).toContain("application");
  });

  it("fakeMoreCards returns schema-valid cards distinct from existing fronts", () => {
    const existing = ["Define: distribution", "When would you apply the idea?"];
    const output = fakeMoreCards("Distribution outlasts data", SAMPLE, existing);
    const parsed = AdditionalCardsResultSchema.safeParse(output);
    expect(parsed.success).toBe(true);
    for (const card of output.cards) {
      expect(existing).not.toContain(card.front);
    }
  });

  it("fakeThemes finds overlapping concepts across sources", () => {
    const sources = [
      {
        id: 1,
        title: "On distribution",
        concepts: [{ name: "moats" }, { name: "distribution" }],
      },
      {
        id: 2,
        title: "On data",
        concepts: [{ name: "moats" }, { name: "data" }],
      },
      {
        id: 3,
        title: "On brand",
        concepts: [{ name: "moats" }, { name: "brand" }],
      },
    ];
    const output = fakeThemes(sources);
    const parsed = ThemesResultSchema.safeParse(output);
    expect(parsed.success).toBe(true);
    expect(output.themes[0].source_ids.length).toBeGreaterThanOrEqual(2);
    expect(output.themes[0].label.toLowerCase()).toContain("moats");
  });

  it("fakeEssay produces schema-valid Markdown with citations", () => {
    const sources = [
      { id: 1, title: "Distribution", excerpt: "Distribution wins." },
      { id: 2, title: "Data", excerpt: "Data moats erode." },
      { id: 3, title: "Brand", excerpt: "Brand compounds." },
    ];
    const output = fakeEssay(
      "Distribution outlasts data",
      "A pattern across captured material.",
      sources,
    );
    const parsed = EssayResultSchema.safeParse(output);
    expect(parsed.success).toBe(true);
    expect(output.draft_md).toContain("[^1]");
    expect(output.citations.length).toBeGreaterThanOrEqual(2);
  });
});
