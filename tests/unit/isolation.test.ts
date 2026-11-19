import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * Two people share one database. Every read and write made as Alice must
 * leave Bob's rows unseen and unchanged, including when she guesses his ids.
 * The model, embeddings and theme calls are mocked; the database is real
 * SQLite with the app's schema.
 */

let sqlite: Database.Database;
const TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");

vi.mock("@/lib/db/client", () => ({
  getDb: async () => drizzle(sqlite, { schema }),
  getEnv: async () => ({ KC_TOKEN_KEY: TOKEN_KEY }),
}));

const processSource = vi.fn();
vi.mock("@/lib/ai/process", () => ({
  processSource: (args: unknown) => processSource(args),
}));
const generateMoreCards = vi.fn();
vi.mock("@/lib/ai/more-cards", () => ({
  generateMoreCards: (args: unknown) => generateMoreCards(args),
}));
const findThemes = vi.fn();
vi.mock("@/lib/ai/themes", () => ({
  findThemes: (args: unknown) => findThemes(args),
}));
vi.mock("@/lib/embeddings/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/embeddings/client")>()),
  embed: async () => new Float32Array([0.5, 0.25]),
}));

const queries = await import("@/lib/services/queries");
const { gradeCard } = await import("@/lib/services/review");
const { addMoreCards } = await import("@/lib/services/cards");
const { retrySource, ingestExternal, processPendingSources } = await import(
  "@/lib/services/ingest"
);
const decks = await import("@/lib/services/decks");
const { generateThemes, draftEssayForTheme } = await import(
  "@/lib/services/themes"
);
const integrations = await import("@/lib/services/ingest-orchestrator");

const ALICE = "alice-google-id";
const BOB = "bob-google-id";
const SAME_VECTOR = Buffer.from(new Float32Array([0.5, 0.25]).buffer);

function addSource(owner: string, title: string, status = "processed"): number {
  const id = Number(
    sqlite
      .prepare(
        "INSERT INTO sources (owner_id, kind, title, raw_content, excerpt, " +
          "status) VALUES (?, 'text', ?, 'body', 'body', ?)",
      )
      .run(owner, title, status).lastInsertRowid,
  );
  if (status === "processed") {
    sqlite
      .prepare(
        "INSERT INTO processings (owner_id, source_id, why_i_cared, " +
          "key_takeaways, concepts, embedding) VALUES (?, ?, 'w', '[]', " +
          "'[]', ?)",
      )
      .run(owner, id, SAME_VECTOR);
    sqlite
      .prepare(
        "INSERT INTO cards (owner_id, source_id, card_type, front, back, " +
          "due_at) VALUES (?, ?, 'definition', ?, 'A', 0)",
      )
      .run(owner, id, `${title} Q`);
  }
  return id;
}

function cardOf(sourceId: number) {
  return sqlite
    .prepare("SELECT id, repetitions FROM cards WHERE source_id = ?")
    .get(sourceId) as { id: number; repetitions: number };
}

function addTheme(owner: string, sourceIds: number[]): number {
  return Number(
    sqlite
      .prepare(
        "INSERT INTO themes (owner_id, label, summary, source_ids) " +
          "VALUES (?, 'Bob theme', 's', ?)",
      )
      .run(owner, JSON.stringify(sourceIds)).lastInsertRowid,
  );
}

let alice1: number;
let alice2: number;
let bob1: number;
let bob2: number;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(
    readFileSync(path.join(process.cwd(), "lib", "db", "local-schema.sql"), "utf8"),
  );
  alice1 = addSource(ALICE, "Alice one");
  alice2 = addSource(ALICE, "Alice two");
  bob1 = addSource(BOB, "Bob one");
  bob2 = addSource(BOB, "Bob two", "failed");
  processSource.mockReset();
  generateMoreCards.mockReset();
  findThemes.mockReset();
});

describe("reading", () => {
  it("lists only Alice's sources", async () => {
    const list = await queries.listSources(ALICE);

    expect(list.map((s) => s.source.title).sort()).toEqual([
      "Alice one",
      "Alice two",
    ]);
  });

  it("finds nothing when Alice opens Bob's source by id", async () => {
    expect(await queries.getSourceDetail(ALICE, bob1)).toBeNull();
  });

  it("never offers Bob's source as related, however similar", async () => {
    const detail = await queries.getSourceDetail(ALICE, alice1);

    expect(detail?.related.map((r) => r.source.id)).toEqual([alice2]);
  });

  it("queues and counts only Alice's due cards", async () => {
    const due = await queries.listDueCards(ALICE);
    const count = await queries.countDueCards(ALICE);

    expect(due.map((d) => d.source.id).sort()).toEqual([alice1, alice2]);
    expect(count).toBe(2);
  });

  it("builds Alice's theme corpus from her sources alone", async () => {
    const corpus = await queries.getCorpusForThemes(ALICE);

    expect(corpus.map((c) => c.id).sort()).toEqual([alice1, alice2]);
  });
});

describe("changing Bob's rows by guessing ids", () => {
  it("cannot grade Bob's card", async () => {
    const card = cardOf(bob1);

    await expect(gradeCard(ALICE, card.id, 3)).rejects.toThrow("Card not found.");
    expect(cardOf(bob1).repetitions).toBe(0);
  });

  it("cannot add cards to Bob's source", async () => {
    await expect(addMoreCards(ALICE, bob1)).rejects.toThrow("Source not found.");
    expect(generateMoreCards).not.toHaveBeenCalled();
  });

  it("cannot retry Bob's failed source", async () => {
    await expect(retrySource(ALICE, bob2)).rejects.toThrow("Source not found.");
    const row = sqlite.prepare("SELECT status FROM sources WHERE id = ?").get(bob2);
    expect(row).toEqual({ status: "failed" });
  });

  it("cannot open, draft from, or wipe Bob's themes", async () => {
    const bobTheme = addTheme(BOB, [bob1, bob2]);
    findThemes.mockResolvedValue({
      themes: [
        { label: "Mine", summary: "s".repeat(40), source_ids: [alice1, alice2] },
      ],
    });

    const opened = await queries.getTheme(ALICE, bobTheme);
    await expect(draftEssayForTheme(ALICE, bobTheme)).rejects.toThrow(
      "Theme not found.",
    );
    await generateThemes(ALICE);

    expect(opened).toBeNull();
    expect((await queries.listThemes(BOB)).map((t) => t.id)).toEqual([bobTheme]);
    expect((await queries.listThemes(ALICE)).map((t) => t.label)).toEqual(["Mine"]);
  });

  it("cannot open Bob's essay", async () => {
    const essay = Number(
      sqlite
        .prepare(
          "INSERT INTO essays (owner_id, title, draft_md, citations) " +
            "VALUES (?, 'Bob essay', 'md', '[]')",
        )
        .run(BOB).lastInsertRowid,
    );

    expect(await queries.getEssay(ALICE, essay)).toBeNull();
    expect(await queries.listEssays(ALICE)).toEqual([]);
  });
});

describe("decks", () => {
  it("refuses a deck made of Bob's sources", async () => {
    await expect(
      decks.createDeck({ ownerId: ALICE, title: "Steal", sourceIds: [bob1] }),
    ).rejects.toThrow("None of the selected sources exist.");
  });

  it("drops Bob's ids from a deck that mixes them in", async () => {
    const deck = await decks.createDeck({
      ownerId: ALICE,
      title: "Mixed",
      sourceIds: [alice1, bob1],
    });
    const shared = await decks.getDeckByToken(deck.shareToken);

    expect(shared?.cards.map((c) => c.sourceId)).toEqual([alice1]);
  });

  it("shows only the deck owner's cards on a share link", async () => {
    // A deck row naming another person's source, however it got there.
    sqlite
      .prepare(
        "INSERT INTO decks (owner_id, title, share_token, source_ids) " +
          "VALUES (?, 'Odd', 'tok-odd', ?)",
      )
      .run(ALICE, JSON.stringify([alice1, bob1]));

    const shared = await decks.getDeckByToken("tok-odd");

    expect(shared?.cards.map((c) => c.sourceId)).toEqual([alice1]);
  });

  it("cannot list or delete Bob's deck", async () => {
    const bobDeck = await decks.createDeck({
      ownerId: BOB,
      title: "Bob deck",
      sourceIds: [bob1],
    });

    const listed = await decks.listDecks(ALICE);
    const deleted = await decks.deleteDeck(ALICE, bobDeck.id);

    expect(listed).toEqual([]);
    expect(deleted).toBe(false);
    expect((await decks.listDecks(BOB)).map((d) => d.deck.id)).toEqual([bobDeck.id]);
  });
});

describe("integrations and the drain", () => {
  it("keeps each person's Readwise token to themselves", async () => {
    await integrations.setIntegrationToken(ALICE, "readwise", "alice-token-1");

    const bobStatus = await integrations.listIntegrationStatus(BOB);

    expect(bobStatus[0]?.configured).toBe(false);
    await expect(integrations.syncIntegration(BOB, "readwise")).rejects.toThrow(
      "No token configured",
    );
  });

  it("dedupes a highlight per person, so both can import it", async () => {
    const input = {
      sourceType: "readwise" as const,
      externalId: "rw-1",
      title: "T",
      text: "highlight",
    };

    const a = await ingestExternal({ ...input, ownerId: ALICE });
    const b = await ingestExternal({ ...input, ownerId: BOB });

    expect([a.status, b.status]).toEqual(["pending", "pending"]);
  });

  it("files the drain's notes and cards under the row's owner", async () => {
    const { sourceId } = await ingestExternal({
      ownerId: BOB,
      sourceType: "readwise",
      externalId: "rw-2",
      title: "T",
      text: "highlight",
    });
    processSource.mockResolvedValue({
      why_i_cared: "w",
      key_takeaways: ["k"],
      concepts: [{ name: "c", weight: 1 }],
      cards: [{ type: "definition", front: "Bob new Q", back: "A" }],
    });

    await processPendingSources(5);

    const owners = sqlite
      .prepare(
        "SELECT (SELECT owner_id FROM processings WHERE source_id = ?) p, " +
          "(SELECT owner_id FROM cards WHERE source_id = ?) c",
      )
      .get(sourceId, sourceId);
    expect(owners).toEqual({ p: BOB, c: BOB });
    expect((await queries.listDueCards(ALICE)).map((d) => d.card.front)).not
      .toContain("Bob new Q");
  });
});
