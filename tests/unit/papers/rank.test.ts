import { describe, expect, it } from "vitest";
import {
  applyFeedback,
  buildIndex,
  feedbackTerms,
  pickDaily,
  rankPapers,
  textTerms,
  type ProfileTerm,
} from "@/lib/papers/rank";

const paper = (arxivId: string, title: string, abstract = "", hfUpvotes = 0) => ({
  arxivId,
  title,
  abstract,
  hfUpvotes,
});

const POOL = [
  paper("rl-hack", "Reward hacking in RL environments", "We study reward hacking."),
  paper("rl-env", "Scaling RL environments for agents", "Verifiable rewards."),
  paper("diffusion", "Image generation with diffusion", "Reward hacking in images."),
  paper("robot", "Robot grasping from video", "Manipulation policies."),
  paper("vision", "Vision transformers at scale", "Image classification."),
];

const own = (term: string, weight: number): ProfileTerm => ({
  term,
  weight,
  source: "written",
});
const fb = (term: string, weight: number): ProfileTerm => ({
  term,
  weight,
  source: "feedback",
});

describe("rankPapers", () => {
  it("ranks papers by how strongly they match the person's terms", () => {
    const index = buildIndex(POOL);
    const ranked = rankPapers(index, [
      own("reward hacking", 1),
      own("RL environments", 0.8),
    ]);
    const ids = ranked.map((r) => r.arxivId);

    expect(ids[0]).toBe("rl-hack");
    expect(ids).not.toContain("robot");
    expect(ids).not.toContain("vision");
  });

  it("leaves out papers matching a term the person excluded", () => {
    const index = buildIndex(POOL);
    const ranked = rankPapers(index, [
      own("reward hacking", 1),
      own("image generation", -1),
    ]);

    expect(ranked.map((r) => r.arxivId)).toEqual(["rl-hack"]);
  });

  it("lets popularity scale a match but never create one", () => {
    const pool = [
      paper("quiet", "Reward hacking", "", 0),
      paper("loud", "Reward hacking", "", 100),
      paper("viral", "Unrelated vision paper", "", 500),
    ];
    const ranked = rankPapers(buildIndex(pool), [own("reward hacking", 1)]);

    expect(ranked.map((r) => r.arxivId)).toEqual(["loud", "quiet"]);
  });

  it("says which of the person's terms each paper matched", () => {
    const ranked = rankPapers(buildIndex(POOL), [
      own("reward hacking", 1),
      own("agents", 0.5),
    ]);

    expect(ranked.find((r) => r.arxivId === "rl-env")?.matched).toEqual(["agents"]);
  });

  it("keeps relevance between 0 and 1 so a weak day stays weak", () => {
    const ranked = rankPapers(buildIndex(POOL), [own("grasping", 0.1)]);

    expect(ranked[0].relevance).toBeGreaterThan(0);
    expect(ranked[0].relevance).toBeLessThan(0.3);
  });

  it("feedback negatives lower a paper without excluding it", () => {
    const index = buildIndex(POOL);
    const terms = [own("reward hacking", 1), fb("rewards", -0.3)];

    expect(rankPapers(index, terms).map((r) => r.arxivId)).toContain("rl-hack");
  });

  it("a negative paraphrase from the model lowers a paper but keeps it", () => {
    const pool = [paper("dp", "Diffusion policy for robot manipulation")];
    const terms: ProfileTerm[] = [
      own("robot manipulation", 1),
      { term: "diffusion", weight: -0.3, source: "compiled" },
    ];

    expect(rankPapers(buildIndex(pool), terms).map((r) => r.arxivId)).toEqual([
      "dp",
    ]);
  });
});

describe("pickDaily", () => {
  it("prefers picks led by different terms, then fills with the best rest", () => {
    const ranked = [
      { arxivId: "a", score: 0.9, relevance: 0.9, matched: ["x"], strongest: "x" },
      { arxivId: "b", score: 0.8, relevance: 0.8, matched: ["x"], strongest: "x" },
      { arxivId: "c", score: 0.7, relevance: 0.7, matched: ["y"], strongest: "y" },
      { arxivId: "d", score: 0.6, relevance: 0.6, matched: ["x"], strongest: "x" },
    ];

    expect(pickDaily(ranked, 2).map((r) => r.arxivId)).toEqual(["a", "c"]);
    expect(pickDaily(ranked, 3).map((r) => r.arxivId)).toEqual(["a", "b", "c"]);
  });
});

describe("feedback", () => {
  const index = buildIndex([
    ...POOL,
    paper("p6", "Agents and reward models", "Reward hacking again."),
    paper("p7", "Reward hacking survey", "Agents."),
  ]);

  it("takes strong shared terms, never one-off words or own terms", () => {
    const terms = feedbackTerms(index, "rl-hack", [own("reward hacking", 1)], 3);

    expect(terms).not.toContain("reward hacking");
    expect(terms.every((t) => (index.df.get(t) ?? 0) >= 3)).toBe(true);
  });

  it("moves weights by 0.3 within -1..1, never the person's own", () => {
    const start: ProfileTerm[] = [own("reward hacking", 1), fb("agents", 0.9)];

    const after = applyFeedback(start, ["agents", "reward hacking", "rl"], 0.3);

    expect(after).toEqual([
      own("reward hacking", 1),
      fb("agents", 1),
      fb("rl", 0.3),
    ]);
  });

  it("keeps at most 60 feedback terms, dropping the oldest", () => {
    const many = Array.from({ length: 60 }, (_, i) => fb(`t${i}`, 0.3));

    const after = applyFeedback(many, ["fresh"], 0.3);

    expect([after.length, after[0].term, after.at(-1)?.term]).toEqual([
      60,
      "t1",
      "fresh",
    ]);
  });
});

describe("textTerms", () => {
  it("reads phrases, exclusions and long sentences from plain interest text", () => {
    const terms = textTerms(
      "reward hacking, RL environments and world models\nnot image generation; " +
        "I want papers about how agents learn tools",
    );

    expect(terms.map((t) => [t.term, t.weight])).toEqual([
      ["reward hacking", 1],
      ["RL environments", 1],
      ["world models", 1],
      ["image generation", -1],
      ["agent", 0.5],
      ["learn", 0.5],
      ["tool", 0.5],
    ]);
  });
});

describe("terms that say little", () => {
  // 60 papers: "mean" appears in 20 (a third), "world models" in 2.
  const big = buildIndex([
    paper("wm1", "World models for planning", "We report the mean reward."),
    paper("wm2", "World models from video", "A mean field view."),
    ...Array.from({ length: 18 }, (_, i) =>
      paper(`m${i}`, `Topic ${i} study`, "We report the mean error."),
    ),
    ...Array.from({ length: 40 }, (_, i) => paper(`x${i}`, `Other ${i}`, "Text.")),
  ]);

  it("ignores a library or feedback term found in over a tenth of papers", () => {
    const terms: ProfileTerm[] = [{ term: "Mean", weight: 0.6, source: "compiled" }];

    expect(rankPapers(big, terms)).toEqual([]);
  });

  it("keeps a common word the person wrote themselves", () => {
    expect(rankPapers(big, [own("mean", 1)]).length).toBe(20);
  });

  it("explains a pick only by the terms that carried it", () => {
    const terms: ProfileTerm[] = [
      own("world models", 1),
      { term: "reward", weight: 0.05, source: "compiled" },
    ];

    expect(rankPapers(big, terms)[0].matched).toEqual(["world models"]);
  });
});
