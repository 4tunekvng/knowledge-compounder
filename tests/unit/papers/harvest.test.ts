import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * Pins what a harvest stores. getDb is a fresh in-memory SQLite per test and
 * fetch is a stub that serves the saved arXiv and Hugging Face responses, so
 * nothing leaves the process.
 */

let sqlite: Database.Database;
vi.mock("@/lib/db/client", () => ({
  getDb: async () => drizzle(sqlite, { schema }),
}));

const { harvestIfDue, HARVEST_EVERY_MS } = await import("@/lib/papers/harvest");

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const NOW = Date.parse("2026-11-19T06:00:00Z");

// cs.LG serves the saved feed, every other category is down, and Hugging
// Face lists a paper that the cs.LG feed also has (with upvotes and code).
function stubFetch(calls: string[] = []) {
  const hf = JSON.parse(fixture("hf-daily.json"));
  hf[0].paper.id = "2611.23240";
  return async (url: string) => {
    calls.push(url);
    if (url.endsWith("/rss/cs.LG")) return new Response(fixture("arxiv-cs.LG.xml"));
    if (url.includes("huggingface.co")) return Response.json(hf);
    return new Response("busy", { status: 503 });
  };
}

function storedPaper(id: string) {
  return sqlite
    .prepare(
      "SELECT title, categories, hf_upvotes, github_url FROM papers " +
        "WHERE arxiv_id = ?",
    )
    .get(id);
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(
    readFileSync(path.join(process.cwd(), "lib", "db", "local-schema.sql"), "utf8"),
  );
});

describe("harvestIfDue", () => {
  it("stores each paper once, joining its arXiv and Hugging Face rows", async () => {
    const summary = await harvestIfDue(NOW, stubFetch());

    expect(summary?.papersSeen).toBe(5);
    expect(storedPaper("2611.23240")).toEqual({
      title: expect.stringMatching(/^Neural Network-Based Modeling/),
      categories: '["cs.LG","cs.NE"]',
      hf_upvotes: 156,
      github_url: null,
    });
  });

  it("records the sources that failed and still stores the rest", async () => {
    const summary = await harvestIfDue(NOW, stubFetch());

    expect(summary?.failedSources).toEqual([
      "arxiv:cs.AI",
      "arxiv:cs.CL",
      "arxiv:cs.CV",
      "arxiv:cs.RO",
      "arxiv:stat.ML",
    ]);
  });

  it("does nothing until the last harvest is old enough", async () => {
    await harvestIfDue(NOW, stubFetch());
    const calls: string[] = [];

    const again = await harvestIfDue(NOW + HARVEST_EVERY_MS - 1, stubFetch(calls));

    expect([again, calls.length]).toEqual([null, 0]);
  });

  it("harvests again once a new reading day starts at 05:00 UTC", async () => {
    await harvestIfDue(Date.parse("2026-11-19T04:58:00Z"), stubFetch());
    const calls: string[] = [];

    await harvestIfDue(Date.parse("2026-11-19T05:01:00Z"), stubFetch(calls));

    expect(calls.length).toBe(8);
  });

  it("keeps upvotes and code links a later harvest no longer sees", async () => {
    await harvestIfDue(NOW, stubFetch());
    const arxivOnly = async (url: string) =>
      url.endsWith("/rss/cs.LG")
        ? new Response(fixture("arxiv-cs.LG.xml"))
        : new Response("busy", { status: 503 });

    await harvestIfDue(NOW + HARVEST_EVERY_MS, arxivOnly);

    expect(storedPaper("2611.23240")).toMatchObject({ hf_upvotes: 156 });
  });
});
