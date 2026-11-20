import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * "See also" on a source page links captures that share a main idea, and
 * only those: two captures that merely use the same common words are not
 * related. The database is real SQLite with the app's schema.
 */

let sqlite: Database.Database;

vi.mock("@/lib/db/client", () => ({
  getDb: async () => drizzle(sqlite, { schema }),
}));

const { getSourceDetail } = await import("@/lib/services/queries");

const OWNER = "reader";

function addCapture(title: string, ideas: [string, number][]): number {
  const id = Number(
    sqlite
      .prepare(
        "INSERT INTO sources (owner_id, kind, title, raw_content, excerpt, " +
          "status) VALUES (?, 'text', ?, 'body', 'body', 'processed')",
      )
      .run(OWNER, title).lastInsertRowid,
  );
  const concepts = ideas.map(([name, weight]) => ({ name, weight }));
  sqlite
    .prepare(
      "INSERT INTO processings (owner_id, source_id, why_i_cared, " +
        "key_takeaways, concepts) VALUES (?, ?, 'w', '[]', ?)",
    )
    .run(OWNER, id, JSON.stringify(concepts));
  return id;
}

const relatedTitles = async (id: number) =>
  (await getSourceDetail(OWNER, id))!.related.map((r) => r.source.title);

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(
    readFileSync(path.join(process.cwd(), "lib", "db", "local-schema.sql"), "utf8"),
  );
});

describe("See also", () => {
  it("links captures that share a main idea, ignoring case", async () => {
    // Arrange
    const sr = addCapture("Spaced repetition", [["Spaced repetition", 0.9]]);
    addCapture("Forgetting", [["spaced_repetition", 0.4]]);
    addCapture("Compound interest", [["Exponential growth", 0.9]]);

    // Act
    const titles = await relatedTitles(sr);

    // Assert
    expect(titles).toEqual(["Forgetting"]);
  });

  it("puts captures sharing more ideas first", async () => {
    // Arrange
    const sr = addCapture("Spaced repetition", [
      ["Spaced repetition", 0.9],
      ["Forgetting curve", 0.6],
    ]);
    addCapture("One idea", [["Spaced repetition", 1]]);
    addCapture("Two ideas", [
      ["Forgetting curve", 0.1],
      ["Spaced repetition", 0.1],
    ]);

    // Act
    const titles = await relatedTitles(sr);

    // Assert
    expect(titles).toEqual(["Two ideas", "One idea"]);
  });

  it("links nothing when no other capture shares an idea", async () => {
    // Arrange
    const pareto = addCapture("Pareto", [["Pareto principle", 0.9]]);
    addCapture("Agents are loops", [["Agent", 0.9], ["Loop", 0.5]]);

    // Act
    const titles = await relatedTitles(pareto);

    // Assert
    expect(titles).toEqual([]);
  });
});
