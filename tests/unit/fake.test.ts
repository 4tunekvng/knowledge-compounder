import { describe, expect, it } from "vitest";
import { fakeEssay, fakeProcessing, fakeThemes } from "@/lib/ai/fake";
import {
  EssayResultSchema,
  ProcessingResultSchema,
  ThemesResultSchema,
} from "@/lib/ai/schemas";

const SAMPLE = `Distribution moats outlast data moats in the LLM era. The data layer commoditizes;
the distribution layer compounds. Founders who optimize for owned channels — newsletter,
podcast, community — will win the next decade. Those who lean on proprietary data alone
will be flattened by the next foundation-model release.`;

describe("fake AI generators", () => {
  it("fakeProcessing emits schema-valid output", () => {
    const output = fakeProcessing("Distribution outlasts data", SAMPLE);
    const result = ProcessingResultSchema.safeParse(output);
    expect(result.success).toBe(true);
    expect(output.cards).toHaveLength(3);
    expect(output.cards.map((c) => c.type).sort()).toEqual([
      "application",
      "definition",
      "mechanism",
    ]);
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
