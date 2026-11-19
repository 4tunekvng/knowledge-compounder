import { readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

/**
 * Pins the ingest pipeline's database effects. getDb is swapped for a fresh
 * in-memory SQLite per test; the model and embedding calls are mocked at
 * the module boundary so nothing leaves the process.
 */

let sqlite: Database.Database;

vi.mock("@/lib/db/client", () => ({
  getDb: async () => drizzle(sqlite, { schema }),
}));

const processSource = vi.fn();
vi.mock("@/lib/ai/process", () => ({
  processSource: (args: unknown) => processSource(args),
}));

vi.mock("@/lib/embeddings/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/embeddings/client")>()),
  embed: async () => new Float32Array([0.5, 0.25]),
}));

const {
  ingest,
  ingestExternal,
  processPendingSources,
  retrySource,
  PROCESSING_FAILED_MESSAGE,
} = await import("@/lib/services/ingest");
const { syncIntegration } = await import("@/lib/services/ingest-orchestrator");

const PROCESSED = {
  why_i_cared: "it matters",
  key_takeaways: ["one"],
  concepts: ["idea"],
  cards: [
    { type: "definition", front: "Q1", back: "A1" },
    { type: "mechanism", front: "Q2", back: "A2" },
  ],
};

const READWISE_INPUT = {
  sourceType: "readwise" as const,
  externalId: "rw-1",
  title: 'A "quoted"\ntitle',
  text: "line one\nline two",
};

function sourceRow(id: number) {
  return sqlite
    .prepare("SELECT status, error_message FROM sources WHERE id = ?")
    .get(id) as { status: string; error_message: string | null };
}

function cardFronts(id: number): string[] {
  const rows = sqlite
    .prepare("SELECT front FROM cards WHERE source_id = ? ORDER BY id")
    .all(id) as { front: string }[];
  return rows.map((r) => r.front);
}

function processingCount(id: number): number {
  const row = sqlite
    .prepare("SELECT COUNT(*) AS n FROM processings WHERE source_id = ?")
    .get(id) as { n: number };
  return row.n;
}

function insertFailedSource(): number {
  const result = sqlite
    .prepare(
      "INSERT INTO sources " +
        "(kind, title, raw_content, excerpt, status, error_message) VALUES " +
        "('text', 'Old \"title\"', 'old\ntext', 'old', 'failed', 'boom')",
    )
    .run();
  const id = Number(result.lastInsertRowid);
  sqlite
    .prepare(
      "INSERT INTO cards (source_id, card_type, front, back) " +
        "VALUES (?, 'definition', 'stale', 'stale')",
    )
    .run(id);
  return id;
}

const HOUR_AGO = Date.now() - 60 * 60_000;

/** A row whose request stopped before processing finished, an hour ago. */
function insertAbandonedSource(title = "Lost", claimedAt = HOUR_AGO): number {
  const result = sqlite
    .prepare(
      "INSERT INTO sources (kind, title, raw_content, excerpt, status, " +
        "created_at, claimed_at) VALUES ('text', ?, 'lost\ntext', 'lost', " +
        "'pending', ?, ?)",
    )
    .run(title, HOUR_AGO, claimedAt);
  return Number(result.lastInsertRowid);
}

function readwiseSource(captures: { externalId: string }[]) {
  return {
    provider: "readwise",
    async *fetchNew() {
      yield* captures.map((c) => ({ ...c, title: "T", text: "highlight" }));
    },
  };
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(
    readFileSync(
      path.join(process.cwd(), "lib", "db", "local-schema.sql"),
      "utf8",
    ),
  );
  processSource.mockReset();
});

describe("ingestExternal", () => {
  it("stores the source as pending without calling the model", async () => {
    const result = await ingestExternal(READWISE_INPUT);

    expect(result).toEqual({ sourceId: 1, status: "pending" });
    expect(sourceRow(1)).toEqual({ status: "pending", error_message: null });
    expect(processSource).not.toHaveBeenCalled();
  });

  it("skips a source it has already ingested", async () => {
    await ingestExternal(READWISE_INPUT);

    const result = await ingestExternal(READWISE_INPUT);

    expect(result).toEqual({ sourceId: 1, status: "skipped", reason: "duplicate" });
  });
});

describe("syncIntegration", () => {
  it("stores every new highlight without calling the model", async () => {
    sqlite
      .prepare("INSERT INTO integration_tokens (provider, token) VALUES (?, ?)")
      .run("readwise", "tok");

    const result = await syncIntegration(
      "readwise",
      readwiseSource([{ externalId: "a" }, { externalId: "b" }]),
    );

    expect(result).toMatchObject({ added: 2, errors: [] });
    expect(processSource).toHaveBeenCalledTimes(0);
    expect([sourceRow(1).status, sourceRow(2).status]).toEqual([
      "pending",
      "pending",
    ]);
  });
});

describe("processPendingSources", () => {
  it("turns a row abandoned an hour ago into a processed source", async () => {
    const id = insertAbandonedSource();
    processSource.mockResolvedValue(PROCESSED);

    const results = await processPendingSources(5);

    expect(results).toEqual([{ sourceId: id, status: "processed" }]);
    expect(sourceRow(id)).toEqual({ status: "processed", error_message: null });
    expect(cardFronts(id)).toEqual(["Q1", "Q2"]);
    expect(processingCount(id)).toBe(1);
  });

  it("processes a highlight that sync stored", async () => {
    await ingestExternal(READWISE_INPUT);
    processSource.mockResolvedValue(PROCESSED);

    await processPendingSources(5);

    expect(sourceRow(1).status).toBe("processed");
    expect(processSource).toHaveBeenCalledWith({
      title: "A  quoted  title",
      text: "line one line two",
    });
  });

  it("marks the source failed with the error when processing throws", async () => {
    const id = insertAbandonedSource();
    processSource.mockRejectedValue(new Error("model down"));

    const results = await processPendingSources(5);

    expect(results).toEqual([
      { sourceId: id, status: "failed", error: PROCESSING_FAILED_MESSAGE },
    ]);
    expect(sourceRow(id)).toEqual({ status: "failed", error_message: "model down" });
  });

  it("replaces cards left behind by a run that died part-way", async () => {
    const id = insertAbandonedSource();
    sqlite
      .prepare(
        "INSERT INTO cards (source_id, card_type, front, back) " +
          "VALUES (?, 'definition', 'half-written', 'x')",
      )
      .run(id);
    processSource.mockResolvedValue(PROCESSED);

    await processPendingSources(5);

    expect(cardFronts(id)).toEqual(["Q1", "Q2"]);
  });

  it("takes only as many rows as the limit allows, oldest first", async () => {
    const first = insertAbandonedSource("first");
    const second = insertAbandonedSource("second");
    processSource.mockResolvedValue(PROCESSED);

    await processPendingSources(1);

    expect([sourceRow(first).status, sourceRow(second).status]).toEqual([
      "processed",
      "pending",
    ]);
  });

  it("leaves alone a capture whose own request is still processing it", async () => {
    let finish: (value: typeof PROCESSED) => void = () => {};
    processSource.mockReturnValueOnce(
      new Promise((resolve) => (finish = resolve)),
    );
    const capture = ingest({ raw: "a note worth keeping" });
    await vi.waitFor(() => expect(processSource).toHaveBeenCalledTimes(1));

    const results = await processPendingSources(5);
    finish(PROCESSED);
    await capture;

    expect(results).toEqual([]);
    expect(processSource).toHaveBeenCalledTimes(1);
    expect(cardFronts(1)).toEqual(["Q1", "Q2"]);
  });

  it("processes a row once when two drains run at the same time", async () => {
    const id = insertAbandonedSource();
    processSource.mockResolvedValue(PROCESSED);

    const [a, b] = await Promise.all([
      processPendingSources(5),
      processPendingSources(5),
    ]);

    expect([...a, ...b]).toEqual([{ sourceId: id, status: "processed" }]);
    expect(processSource).toHaveBeenCalledTimes(1);
    expect(cardFronts(id)).toEqual(["Q1", "Q2"]);
  });
});

describe("retrySource", () => {
  it("replaces old cards with new ones and marks it processed", async () => {
    const id = insertFailedSource();
    processSource.mockResolvedValue(PROCESSED);

    const result = await retrySource(id);

    expect(result).toEqual({ sourceId: id, status: "processed" });
    expect(sourceRow(id)).toEqual({ status: "processed", error_message: null });
    expect(cardFronts(id)).toEqual(["Q1", "Q2"]);
    expect(processingCount(id)).toBe(1);
  });

  it("sends the stored title and text, sanitized, to the model", async () => {
    const id = insertFailedSource();
    processSource.mockResolvedValue(PROCESSED);

    await retrySource(id);

    expect(processSource).toHaveBeenCalledWith({
      title: "Old  title",
      text: "old text",
    });
  });

  it("marks the source failed again when processing throws", async () => {
    const id = insertFailedSource();
    processSource.mockRejectedValue(new Error("still down"));

    const result = await retrySource(id);

    expect(result).toEqual({ sourceId: id, status: "failed", error: PROCESSING_FAILED_MESSAGE });
    expect(sourceRow(id)).toEqual({ status: "failed", error_message: "still down" });
    expect(cardFronts(id)).toEqual([]);
  });

  it("refuses a source that is not in a failed state", async () => {
    await ingestExternal(READWISE_INPUT);

    await expect(retrySource(1)).rejects.toThrow(
      "Source is not in a failed state (current status: pending).",
    );
  });

  it("refuses an unknown source", async () => {
    await expect(retrySource(99)).rejects.toThrow("Source not found.");
  });
});
