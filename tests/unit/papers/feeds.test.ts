import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseArxivAtom, parseArxivRss, parseHfDaily } from "@/lib/papers/feeds";

// Real responses saved on 2026-11-19 (trimmed to a few items).
const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");

describe("parseArxivRss", () => {
  const papers = parseArxivRss(fixture("arxiv-cs.LG.xml"));

  it("keeps new and cross-listed papers and skips replacements", () => {
    expect(papers.map((p) => p.arxivId)).toEqual([
      "2611.23240",
      "2611.23241",
      "2611.22724",
    ]);
  });

  it("reads title, authors, abstract, categories and date", () => {
    expect(papers[0]).toEqual({
      arxivId: "2611.23240",
      title:
        "Neural Network-Based Modeling of Hysteretic Systems: From Prandtl " +
        "and Preisach Neural Networks to Neuro-Madelung and Neuroplastic " +
        "Continuous Models",
      authors: ["Mehrdad Shafiei Dizaji", "Farzad Shafiei Dizaji"],
      abstract: expect.stringMatching(/^Hysteresis is a complex nonlinear/),
      categories: ["cs.LG", "cs.NE"],
      publishedAt: Date.parse("2026-11-19T05:00:00Z"),
      hfUpvotes: null,
      hfSummary: null,
      githubUrl: null,
      source: "arxiv",
    });
  });

  it("returns nothing for a page that is not a feed", () => {
    expect(parseArxivRss("<html><body>busy</body></html>")).toEqual([]);
  });
});

describe("parseHfDaily", () => {
  const papers = parseHfDaily(JSON.parse(fixture("hf-daily.json")));

  it("reads every listed paper with its upvotes and code link", () => {
    expect(
      papers.map((p) => [p.arxivId, p.hfUpvotes, p.githubUrl, p.source]),
    ).toEqual([
      ["2611.22115", 156, null, "hf"],
      ["2611.17621", 92, "https://github.com/SLAI-AITP/AscendGYM", "hf"],
      [
        "2611.22055",
        52,
        "https://github.com/effl-lab/Weight-Space-Programming",
        "hf",
      ],
    ]);
  });

  it("keeps Hugging Face's one-line summary when it has one", () => {
    expect(papers.map((p) => p.hfSummary?.slice(0, 26) ?? null)).toEqual([
      null,
      "AscendGYM provides a bench",
      "When large language models",
    ]);
  });

  it("skips entries without an arXiv id or title", () => {
    expect(parseHfDaily([{ paper: { id: "" } }, { nope: 1 }, null])).toEqual([]);
  });
});

describe("parseArxivAtom", () => {
  const papers = parseArxivAtom(fixture("arxiv-api.xml"));

  it("reads each record by its id without the version", () => {
    expect(papers.map((p) => p.arxivId).sort()).toEqual([
      "2604.06425",
      "2610.17062",
    ]);
  });

  it("reads title, abstract, authors, categories and first-version date", () => {
    const graft = papers.find((p) => p.arxivId === "2610.17062");

    expect(graft).toMatchObject({
      title: "Gradient Routing Localizes and Removes Unintended Behaviors in RL",
      abstract: expect.stringMatching(/^We propose a mitigation to reward hacking/),
      authors: expect.arrayContaining(["Jake Ward"]),
      categories: expect.arrayContaining(["cs.LG"]),
      publishedAt: Date.parse("2026-10-12T16:28:28Z"),
    });
  });
});
