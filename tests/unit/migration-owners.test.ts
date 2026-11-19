import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * Migration 0005 against a database built the way production's was: the
 * migrations before it, in order, then rows made before sign-in existed.
 */

const FORTUNE = "111796540707500759177";
const TABLES = ["sources", "processings", "cards", "themes", "essays", "decks"];

function migration(file: string): string {
  return readFileSync(path.join(process.cwd(), "migrations", file), "utf8");
}

let db: Database.Database;

function count(sql: string): number {
  return (db.prepare(sql).get() as { n: number }).n;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  for (const file of [
    "0001_init.sql",
    "0002_auto_ingest.sql",
    "0003_decks.sql",
    "0004_claimed_at.sql",
  ]) {
    db.exec(migration(file));
  }
  db.exec(`
    INSERT INTO sources (kind, title, raw_content, excerpt, status,
      source_type, external_id)
      VALUES ('text', 'One', 'b', 'b', 'processed', 'readwise', 'rw-1'),
             ('url', 'Two', 'b', 'b', 'failed', 'url', NULL);
    INSERT INTO processings (source_id, why_i_cared, key_takeaways, concepts)
      VALUES (1, 'w', '[]', '[]');
    INSERT INTO cards (source_id, card_type, front, back)
      VALUES (1, 'definition', 'Q', 'A'), (1, 'mechanism', 'Q2', 'A2');
    INSERT INTO themes (label, summary, source_ids) VALUES ('T', 's', '[1,2]');
    INSERT INTO essays (theme_id, title, draft_md, citations)
      VALUES (1, 'E', 'md', '[]');
    INSERT INTO decks (title, share_token, source_ids) VALUES ('D', 'tok', '[1]');
    INSERT INTO integration_tokens (provider, token) VALUES ('readwise', 'old');
  `);
});

describe("migration 0005_owners", () => {
  it("keeps every row and gives each one to Fortune", () => {
    const before = TABLES.map((t) => count(`SELECT COUNT(*) n FROM ${t}`));

    db.exec(migration("0005_owners.sql"));

    const after = TABLES.map((t) => count(`SELECT COUNT(*) n FROM ${t}`));
    const fortunes = TABLES.map((t) =>
      count(`SELECT COUNT(*) n FROM ${t} WHERE owner_id = '${FORTUNE}'`),
    );
    expect(after).toEqual(before);
    expect(fortunes).toEqual(before);
  });

  it("moves the integration token to Fortune, keeping its sync state", () => {
    db.exec(migration("0005_owners.sql"));

    const row = db
      .prepare("SELECT owner_id, provider, token FROM integration_tokens")
      .get();
    expect(row).toEqual({ owner_id: FORTUNE, provider: "readwise", token: "old" });
  });

  it("lets a second person connect the same provider", () => {
    db.exec(migration("0005_owners.sql"));

    db.prepare(
      "INSERT INTO integration_tokens (owner_id, provider, token) VALUES (?, ?, ?)",
    ).run("someone-else", "readwise", "theirs");

    expect(count("SELECT COUNT(*) n FROM integration_tokens")).toBe(2);
  });

  it("still refuses a second token for the same person and provider", () => {
    db.exec(migration("0005_owners.sql"));
    const insert = db.prepare(
      "INSERT INTO integration_tokens (owner_id, provider, token) VALUES (?, ?, ?)",
    );

    expect(() => insert.run(FORTUNE, "readwise", "again")).toThrow(/UNIQUE/);
  });

  it("dedupes a re-synced highlight per person, not across people", () => {
    db.exec(migration("0005_owners.sql"));
    const insert = db.prepare(
      "INSERT INTO sources (owner_id, kind, title, raw_content, excerpt, " +
        "source_type, external_id) VALUES (?, 'text', 't', 'b', 'b', " +
        "'readwise', 'rw-1')",
    );

    insert.run("someone-else");

    expect(() => insert.run(FORTUNE)).toThrow(/UNIQUE/);
  });

  it("files a row inserted without an owner under nobody", () => {
    db.exec(migration("0005_owners.sql"));

    db.exec(
      "INSERT INTO sources (kind, title, raw_content, excerpt) " +
        "VALUES ('text', 't', 'b', 'b')",
    );

    expect(count("SELECT COUNT(*) n FROM sources WHERE owner_id = ''")).toBe(1);
  });
});
