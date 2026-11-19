import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * Pins what each member sees and changes. getDb is a fresh in-memory SQLite
 * per test, filled with a small pool of papers.
 */

let sqlite: Database.Database;
vi.mock("@/lib/db/client", () => ({
  getDb: async () => drizzle(sqlite, { schema }),
}));

const extractFromUrl = vi.fn();
vi.mock("@/lib/extract/url", () => ({
  extractFromUrl: (url: string) => extractFromUrl(url),
}));

const readers = await import("@/lib/papers/readers");

const NOW = Date.parse("2026-11-19T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const FORTUNE = "google-fortune";
const FRIEND = "google-friend";

const POOL = [
  [
    "2611.00001",
    "Reward hacking in RL environments",
    "Policies exploit reward models.",
  ],
  [
    "2611.00002",
    "Detecting reward hacking with monitors",
    "A monitor flags reward hacking.",
  ],
  ["2611.00003", "Specification gaming survey", "Reward hacking and gaming."],
  ["2611.00004", "Reward hacking under distribution shift", "Reward models drift."],
  ["2611.00005", "Dexterous robot grasping", "Robot manipulation from video."],
  ["2611.00006", "Robot manipulation with tactile sensing", "Grasping objects."],
  [
    "2611.00007",
    "Image generation with diffusion",
    "Reward hacking in image models.",
  ],
];

function seedPapers(harvestedAt: number) {
  const insert = sqlite.prepare(
    `INSERT INTO papers (arxiv_id, title, authors, abstract, categories,
       published_at, harvested_at) VALUES (?, ?, '[]', ?, '[]', ?, ?)`,
  );
  for (const [id, title, abstract] of POOL) {
    insert.run(id, title, abstract, harvestedAt, harvestedAt);
  }
}

const ids = (picks: { arxivId: string }[]) => picks.map((p) => p.arxivId);

beforeEach(() => {
  extractFromUrl.mockReset();
  extractFromUrl.mockRejectedValue(new Error("no HTML version"));
  sqlite = new Database(":memory:");
  sqlite.exec(
    readFileSync(path.join(process.cwd(), "lib", "db", "local-schema.sql"), "utf8"),
  );
  seedPapers(NOW - DAY);
});

describe("two members", () => {
  it("each get picks for their own interests and never the other's", async () => {
    await readers.saveInterests(
      FORTUNE,
      "reward hacking, not image generation",
      NOW,
    );
    await readers.saveInterests(FRIEND, "robot manipulation, grasping", NOW);

    const fortune = await readers.todaysPicks(FORTUNE, NOW);
    const friend = await readers.todaysPicks(FRIEND, NOW);

    expect(ids(fortune).sort()).toEqual(["2611.00001", "2611.00002", "2611.00003"]);
    expect(ids(friend).sort()).toEqual(["2611.00005", "2611.00006"]);
    expect((await readers.getProfile(FRIEND))?.interestsText).toBe(
      "robot manipulation, grasping",
    );
  });

  it("one member's clicks and deletion leave the other untouched", async () => {
    await readers.saveInterests(FORTUNE, "reward hacking", NOW);
    await readers.saveInterests(FRIEND, "reward hacking", NOW);
    await readers.recordEvent(FRIEND, "2611.00002", "less", NOW);
    await readers.deleteReadingData(FRIEND);

    expect(ids(await readers.todaysPicks(FORTUNE, NOW))).toContain("2611.00002");
    expect(await readers.getProfile(FRIEND)).toBeNull();
    expect(await readers.getProfile(FORTUNE)).not.toBeNull();
  });
});

describe("todaysPicks", () => {
  it("returns the same picks all day", async () => {
    await readers.saveInterests(FORTUNE, "reward hacking", NOW);

    const morning = await readers.todaysPicks(FORTUNE, NOW);
    const evening = await readers.todaysPicks(FORTUNE, NOW + 8 * 60 * 60 * 1000);

    expect(ids(evening)).toEqual(ids(morning));
  });

  it("drops a paper marked 'less' and fills the gap", async () => {
    await readers.saveInterests(FORTUNE, "reward hacking", NOW);
    const before = await readers.todaysPicks(FORTUNE, NOW);

    await readers.recordEvent(FORTUNE, before[0].arxivId, "less", NOW);
    const after = await readers.todaysPicks(FORTUNE, NOW);

    expect(ids(after)).not.toContain(before[0].arxivId);
    expect(after).toHaveLength(3);
  });

  it("shows why each paper was picked and a summary from its abstract", async () => {
    await readers.saveInterests(FRIEND, "robot manipulation", NOW);

    const picks = await readers.todaysPicks(FRIEND, NOW);

    expect(picks.find((p) => p.arxivId === "2611.00006")).toMatchObject({
      matched: ["robot manipulation"],
      summary: "Grasping objects.",
    });
  });

  it("returns nothing, not an error, for someone with no profile", async () => {
    expect(await readers.todaysPicks("google-stranger", NOW)).toEqual([]);
  });
});

describe("rankActiveMembers", () => {
  it("ranks members seen in the last 30 days who have no list today", async () => {
    await readers.saveInterests(FORTUNE, "reward hacking", NOW - 40 * DAY);
    await readers.saveInterests(FRIEND, "robot manipulation", NOW - DAY);

    expect(await readers.rankActiveMembers(NOW, 25)).toBe(1);
    expect(await readers.rankActiveMembers(NOW, 25)).toBe(0);
  });
});

function librarySources(owner: string) {
  return sqlite
    .prepare(
      "SELECT source_type, external_id, url, status, raw_content FROM sources " +
        "WHERE owner_id = ? ORDER BY id",
    )
    .all(owner) as Record<string, string>[];
}

function addProcessedSource(owner: string, concepts: object[]) {
  const { lastInsertRowid } = sqlite
    .prepare(
      "INSERT INTO sources (owner_id, kind, title, raw_content, excerpt, status) " +
        "VALUES (?, 'text', 't', 'x', 'x', 'processed')",
    )
    .run(owner);
  sqlite
    .prepare(
      "INSERT INTO processings (owner_id, source_id, why_i_cared, key_takeaways, " +
        "concepts) VALUES (?, ?, 'w', '[]', ?)",
    )
    .run(owner, lastInsertRowid, JSON.stringify(concepts));
}

describe("save to library", () => {
  it("files the paper's full text as a pending capture, once", async () => {
    extractFromUrl.mockResolvedValue({
      title: "x",
      text: "Full paper text. ".repeat(50),
      excerpt: "",
    });
    await readers.saveInterests(FORTUNE, "reward hacking", NOW);

    const first = await readers.recordEvent(FORTUNE, "2611.00001", "save", NOW);
    const again = await readers.recordEvent(FORTUNE, "2611.00001", "save", NOW);

    expect(extractFromUrl).toHaveBeenCalledWith("https://arxiv.org/html/2611.00001");
    expect(again.sourceId).toBe(first.sourceId);
    expect(librarySources(FORTUNE)).toEqual([
      {
        source_type: "arxiv",
        external_id: "2611.00001",
        url: "https://arxiv.org/abs/2611.00001",
        status: "pending",
        raw_content: expect.stringMatching(/^Full paper text\./),
      },
    ]);
  });

  it("files the title and abstract when arXiv has no HTML version", async () => {
    await readers.recordEvent(FORTUNE, "2611.00005", "save", NOW);

    expect(librarySources(FORTUNE)[0].raw_content).toBe(
      "Dexterous robot grasping\n\nRobot manipulation from video.",
    );
  });

  it("files it in the saver's library only", async () => {
    await readers.recordEvent(FRIEND, "2611.00005", "save", NOW);

    expect([librarySources(FRIEND).length, librarySources(FORTUNE).length]).toEqual([
      1, 0,
    ]);
  });
});

describe("library concepts", () => {
  it("give picks to someone who never wrote interests", async () => {
    addProcessedSource(FRIEND, [{ name: "robot manipulation", weight: 0.9 }]);

    const picks = await readers.todaysPicks(FRIEND, NOW);

    expect(ids(picks).sort()).toEqual(["2611.00005", "2611.00006"]);
  });

  it("never steer another person's picks", async () => {
    addProcessedSource(FRIEND, [{ name: "robot manipulation", weight: 0.9 }]);
    await readers.saveInterests(FORTUNE, "reward hacking", NOW);

    const picks = await readers.todaysPicks(FORTUNE, NOW);

    expect(ids(picks)).not.toContain("2611.00005");
    expect(ids(picks)).not.toContain("2611.00006");
  });
});
