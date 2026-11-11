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

const { ingestExternal, retrySource, PROCESSING_FAILED_MESSAGE } = await import(
  "@/lib/services/ingest"
);

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
  it("stores the source, processing and cards and marks it processed", async () => {
    processSource.mockResolvedValue(PROCESSED);

    const result = await ingestExternal(READWISE_INPUT);

    expect(result).toEqual({ sourceId: 1, status: "processed" });
    expect(sourceRow(1)).toEqual({ status: "processed", error_message: null });
    expect(processingCount(1)).toBe(1);
    expect(cardFronts(1)).toEqual(["Q1", "Q2"]);
  });

  it("sends sanitized title and text to the model", async () => {
    processSource.mockResolvedValue(PROCESSED);

    await ingestExternal(READWISE_INPUT);

    expect(processSource).toHaveBeenCalledWith({
      title: "A  quoted  title",
      text: "line one line two",
    });
  });

  it("skips a source it has already ingested", async () => {
    processSource.mockResolvedValue(PROCESSED);
    await ingestExternal(READWISE_INPUT);

    const result = await ingestExternal(READWISE_INPUT);

    expect(result).toEqual({ sourceId: 1, status: "skipped", reason: "duplicate" });
    expect(processSource).toHaveBeenCalledTimes(1);
  });

  it("marks the source failed with the error when processing throws", async () => {
    processSource.mockRejectedValue(new Error("model down"));

    const result = await ingestExternal(READWISE_INPUT);

    expect(result).toEqual({ sourceId: 1, status: "failed", error: PROCESSING_FAILED_MESSAGE });
    expect(sourceRow(1)).toEqual({ status: "failed", error_message: "model down" });
    expect(cardFronts(1)).toEqual([]);
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
    processSource.mockResolvedValue(PROCESSED);
    await ingestExternal(READWISE_INPUT);

    await expect(retrySource(1)).rejects.toThrow(
      "Source is not in a failed state (current status: processed).",
    );
  });

  it("refuses an unknown source", async () => {
    await expect(retrySource(99)).rejects.toThrow("Source not found.");
  });
});
