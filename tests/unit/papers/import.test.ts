import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { HarvestedPaper } from "@/lib/papers/feeds";
import { arxivIdsIn, buildImportSql } from "@/lib/papers/import";

/** Runs the generated SQL on a fresh SQLite copy of the schema. */

const paper = (arxivId: string, title: string): HarvestedPaper => ({
  arxivId,
  title,
  authors: ["A. O'Brien"],
  abstract: "It's about reward hacking.",
  categories: ["cs.LG"],
  publishedAt: Date.parse("2026-04-17T00:00:00Z"),
  hfUpvotes: null,
  hfSummary: null,
  githubUrl: null,
  source: "arxiv",
});

const NOW = Date.parse("2026-11-19T12:00:00Z");

function freshDb() {
  const db = new Database(":memory:");
  db.exec(
    readFileSync(path.join(process.cwd(), "lib", "db", "local-schema.sql"), "utf8"),
  );
  return db;
}

const IMPORT = {
  ownerId: "google-fortune",
  interests: "reward hacking, world models\nnot image generation",
  saved: ["2604.06425", "2604.06425"],
  read: ["2604.07569"],
  papers: [paper("2604.06425", "Neural Computers"), paper("2604.07569", "Learning")],
  now: NOW,
};

describe("buildImportSql", () => {
  it("imports interests, saves, past reads and their papers once, even if re-run", () => {
    const db = freshDb();

    db.exec(buildImportSql(IMPORT));
    db.exec(buildImportSql(IMPORT));

    expect(
      db.prepare("SELECT arxiv_id, kind FROM reader_events ORDER BY id").all(),
    ).toEqual([
      { arxiv_id: "2604.06425", kind: "save" },
      { arxiv_id: "2604.07569", kind: "imported" },
    ]);
    expect(db.prepare("SELECT count(*) AS n FROM papers").get()).toEqual({ n: 2 });
  });

  it("never overwrites interests already set in the app", () => {
    const db = freshDb();
    db.exec(
      "INSERT INTO reader_profiles (owner_id, interests_text, terms, last_seen_at) " +
        "VALUES ('google-fortune', 'set in the app', '[]', 1)",
    );

    db.exec(buildImportSql(IMPORT));

    expect(db.prepare("SELECT interests_text FROM reader_profiles").get()).toEqual({
      interests_text: "set in the app",
    });
  });

  it("dates old papers by their own date so they never join today's pool", () => {
    const db = freshDb();

    db.exec(buildImportSql(IMPORT));

    expect(db.prepare("SELECT max(harvested_at) AS at FROM papers").get()).toEqual({
      at: Date.parse("2026-04-17T00:00:00Z"),
    });
  });

  it("refuses to import without an owner id", () => {
    expect(() => buildImportSql({ ...IMPORT, ownerId: "" })).toThrow("owner id");
  });
});

describe("arxivIdsIn", () => {
  it("finds each linked arXiv id once, whatever the link form", () => {
    const text =
      "see https://arxiv.org/abs/2604.06425 and arxiv.org/pdf/2604.06425v2, " +
      "plus https://arxiv.org/html/2610.17062v1 but not 2604.99999";

    expect(arxivIdsIn(text)).toEqual(["2604.06425", "2610.17062"]);
  });
});
