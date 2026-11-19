import { beforeAll, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";

let sqlite: Database.Database;

beforeAll(async () => {
  process.env.DATABASE_PATH = ":memory:";
  const { getDb } = await import("@/lib/db/client");
  sqlite = ((await getDb()) as unknown as { $client: Database.Database }).$client;
  sqlite.exec(`
    INSERT INTO sources (id, kind, title, raw_content, excerpt, status)
      VALUES (1, 'text', 'Source', 'body', 'body', 'processed');
    INSERT INTO cards (id, source_id, card_type, front, back)
      VALUES (7, 1, 'definition', 'Q', 'A');
  `);
});

describe("gradeCard", () => {
  it("logs the review with its rating and the card state before and after", async () => {
    // Arrange
    const { gradeCard } = await import("@/lib/services/review");
    const before = Date.now();

    // Act
    const next = await gradeCard(7, 3);

    // Assert
    const rows = sqlite.prepare("SELECT * FROM review_logs WHERE card_id = 7").all();
    expect(rows).toEqual([
      expect.objectContaining({
        card_id: 7,
        rating: 3,
        reviewed_at: expect.any(Number),
        state_before: 0,
        stability_before: 0,
        last_reviewed_at_before: null,
        state_after: next.state,
        stability_after: next.stability,
        difficulty_after: next.difficulty,
        scheduled_days: next.scheduledDays,
      }),
    ]);
    const [row] = rows as { reviewed_at: number }[];
    expect(row.reviewed_at).toBeGreaterThanOrEqual(before);
  });
});
