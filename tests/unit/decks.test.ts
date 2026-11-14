import { beforeAll, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { D1_MAX_BOUND_PARAMS, chunkForD1 } from "@/lib/db/chunk";

const SOURCE_COUNT = 150;

beforeAll(async () => {
  // Emulate Cloudflare D1, which rejects statements with over 100 parameters.
  const prepare = Database.prototype.prepare;
  vi.spyOn(Database.prototype, "prepare").mockImplementation(function (
    this: Database.Database,
    sql: string,
  ) {
    if ((sql.match(/\?/g) ?? []).length > D1_MAX_BOUND_PARAMS) {
      throw new Error("too many SQL variables");
    }
    return prepare.call(this, sql);
  });
  process.env.DATABASE_PATH = ":memory:";
  const { getDb } = await import("@/lib/db/client");
  const db = (await getDb()) as unknown as { $client: Database.Database };
  db.$client.exec(`
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${SOURCE_COUNT})
    INSERT INTO sources (kind, title, raw_content, excerpt, status)
      SELECT 'text', 'Source ' || i, 'body', 'body', 'processed' FROM n;
    INSERT INTO cards (source_id, card_type, front, back)
      SELECT id, 'definition', 'Q' || id, 'A' || id FROM sources;
  `);
});

describe("chunkForD1", () => {
  it("splits a list into slices of at most 100", () => {
    const ids = Array.from({ length: 201 }, (_, n) => n);

    const slices = chunkForD1(ids);

    expect(slices.map((s) => s.length)).toEqual([100, 100, 1]);
    expect(slices.flat()).toEqual(ids);
  });
});

describe("decks over 100 sources", () => {
  it("create, list and open a deck without hitting the parameter limit", async () => {
    const { createDeck, getDeckByToken, listDecks } = await import(
      "@/lib/services/decks"
    );
    const sourceIds = Array.from({ length: SOURCE_COUNT }, (_, n) => SOURCE_COUNT - n);

    const deck = await createDeck({ title: "Big deck", sourceIds });
    const summaries = await listDecks();
    const opened = await getDeckByToken(deck.shareToken);

    expect(summaries[0]?.cardCount).toBe(SOURCE_COUNT);
    expect(opened?.cards).toHaveLength(SOURCE_COUNT);
    expect(opened?.cards.map((c) => c.sourceId)).toEqual(
      [...sourceIds].sort((a, b) => a - b),
    );
  });
});
