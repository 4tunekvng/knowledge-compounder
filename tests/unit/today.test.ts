import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * GET /api/today's summary (lib/services/today.ts) over a real SQLite
 * database with the app's schema, shared by Alice and Bob. Paper picks run
 * the real ranking over a small pool of papers.
 */

let sqlite: Database.Database;
vi.mock("@/lib/db/client", () => ({
  getDb: async () => drizzle(sqlite, { schema }),
}));
vi.mock("@/lib/extract/url", () => ({
  extractFromUrl: async () => {
    throw new Error("no HTML version");
  },
}));

const { todayFor } = await import("@/lib/services/today");
const { saveInterests } = await import("@/lib/papers/readers");
const { GET } = await import("@/app/api/today/route");

const ALICE = "alice-google-id";
const BOB = "bob-google-id";
const NOW = new Date("2026-11-19T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function addSource(
  owner: string,
  title: string,
  status: string,
  createdAt: number,
  processedAt: number | null = null,
): number {
  return Number(
    sqlite
      .prepare(
        "INSERT INTO sources (owner_id, kind, title, raw_content, excerpt, " +
          "status, created_at, processed_at) " +
          "VALUES (?, 'text', ?, 'b', 'b', ?, ?, ?)",
      )
      .run(owner, title, status, createdAt, processedAt).lastInsertRowid,
  );
}

function addCard(owner: string, sourceId: number, dueAt: number): void {
  sqlite
    .prepare(
      "INSERT INTO cards (owner_id, source_id, card_type, front, back, due_at) " +
        "VALUES (?, ?, 'definition', 'Q', 'A', ?)",
    )
    .run(owner, sourceId, dueAt);
}

function addPaper(id: string, title: string): void {
  sqlite
    .prepare(
      "INSERT INTO papers (arxiv_id, title, authors, abstract, categories, " +
        "published_at, harvested_at) VALUES (?, ?, '[]', ?, '[]', ?, ?)",
    )
    .run(id, title, title, NOW.getTime() - 24 * HOUR, NOW.getTime() - 24 * HOUR);
}

function asUser(id: string | null): Request {
  const headers: Record<string, string> = {};
  if (id) {
    headers["x-kc-user"] = encodeURIComponent(
      JSON.stringify({ id, email: "", name: "", picture: "" }),
    );
  }
  return new Request("https://knowledge-compounder.fortuneking.dev/api/today", {
    headers,
  });
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.exec(
    readFileSync(path.join(process.cwd(), "lib", "db", "local-schema.sql"), "utf8"),
  );
});

describe("todayFor", () => {
  it("counts only this person's cards due now and links to /review", async () => {
    const old = addSource(ALICE, "Old read", "processed", NOW.getTime() - 72 * HOUR);
    addCard(ALICE, old, NOW.getTime() - HOUR);
    addCard(ALICE, old, NOW.getTime() - 2 * HOUR);
    addCard(ALICE, old, NOW.getTime() + HOUR);
    const bobs = addSource(BOB, "Bob read", "processed", NOW.getTime() - 72 * HOUR);
    addCard(BOB, bobs, NOW.getTime() - HOUR);

    const today = await todayFor(ALICE, NOW);

    expect(today).toEqual({
      app: "knowledge-compounder",
      summary: "2 cards due",
      items: [{ title: "Review 2 cards", href: "/review" }],
    });
  });

  it("puts this person's paper picks right after the cards due", async () => {
    const old = addSource(ALICE, "Old read", "processed", NOW.getTime() - 72 * HOUR);
    addCard(ALICE, old, NOW.getTime() - HOUR);
    addPaper("2611.00001", "Reward hacking in RL environments");
    addPaper("2611.00005", "Dexterous robot grasping");
    await saveInterests(ALICE, "reward hacking", NOW.getTime());
    await saveInterests(BOB, "robot grasping", NOW.getTime());

    const today = await todayFor(ALICE, NOW);

    expect(today.summary).toBe("1 card due · 1 paper picked");
    expect(today.items).toEqual([
      { title: "Review 1 card", href: "/review" },
      {
        title: "Reward hacking in RL environments",
        detail: "Matches reward hacking",
        href: "/papers",
      },
    ]);
  });

  it("puts the newest capture last while it is being read", async () => {
    const old = addSource(ALICE, "Old read", "processed", NOW.getTime() - 72 * HOUR);
    addCard(ALICE, old, NOW.getTime() - HOUR);
    const fresh = addSource(ALICE, "Fresh essay", "pending", NOW.getTime() - HOUR);

    const today = await todayFor(ALICE, NOW);

    expect(today.items).toEqual([
      { title: "Review 1 card", href: "/review" },
      {
        title: "Fresh essay",
        detail: "Still being read",
        href: `/sources/${fresh}`,
      },
    ]);
  });

  it("shows a capture finished since yesterday as ready", async () => {
    const id = addSource(
      ALICE,
      "Done today",
      "processed",
      NOW.getTime() - 3 * HOUR,
      NOW.getTime() - 2 * HOUR,
    );

    const today = await todayFor(ALICE, NOW);

    expect(today.items).toEqual([
      { title: "Done today", detail: "Ready: cards made", href: `/sources/${id}` },
    ]);
  });

  it("leaves out a capture finished more than a day ago", async () => {
    addSource(
      ALICE,
      "Last week",
      "processed",
      NOW.getTime() - 50 * HOUR,
      NOW.getTime() - 49 * HOUR,
    );

    const today = await todayFor(ALICE, NOW);

    expect(today).toEqual({
      app: "knowledge-compounder",
      summary: "No cards due. Nice.",
      items: [],
    });
  });

  it("never shows Bob's newer capture to Alice", async () => {
    addSource(BOB, "Bob's secret", "pending", NOW.getTime() - HOUR);

    const today = await todayFor(ALICE, NOW);

    expect(today.items).toEqual([]);
  });
});

describe("GET /api/today", () => {
  it("answers 401 signed out when the gate attached no one", async () => {
    const res = await GET(asUser(null));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed out" });
  });

  it("answers the signed-in person's own summary", async () => {
    addSource(BOB, "Bob's secret", "pending", Date.now());

    const res = await GET(asUser(ALICE));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      app: "knowledge-compounder",
      summary: "No cards due. Nice.",
      items: [],
    });
  });
});
