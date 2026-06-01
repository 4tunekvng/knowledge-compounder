import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IngestSource, NewCapture } from "@/lib/services/ingest-source";

/**
 * The orchestrator depends on `getDb()` (Cloudflare D1 binding) and
 * `ingestExternal()` (which runs the full AI pipeline). Both are mocked at
 * the module boundary so the test runs in plain Node.
 */

// In-memory token store the mocked DB layer reads/writes.
type TokenRow = {
  provider: string;
  token: string;
  lastSyncedAt: Date | null;
};
const tokenStore = new Map<string, TokenRow>();

// Track every ingestExternal call so assertions can inspect them.
const ingestCalls: Array<{ externalId: string; sourceType: string }> = [];
// Map of externalId → behavior for the mocked ingest pipeline.
const ingestBehavior = new Map<
  string,
  | { kind: "added" }
  | { kind: "skipped" }
  | { kind: "failed"; reason: string }
  | { kind: "throw"; reason: string }
>();

vi.mock("@/lib/db/client", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () => tokenStore.get("readwise") ?? null,
        }),
        all: async () =>
          Array.from(tokenStore.values()).map((r) => ({
            provider: r.provider,
            token: r.token,
            lastSyncedAt: r.lastSyncedAt,
          })),
      }),
    }),
    update: () => ({
      set: (patch: Partial<TokenRow>) => ({
        where: () => ({
          run: async () => {
            const existing = tokenStore.get("readwise");
            if (existing) {
              tokenStore.set("readwise", { ...existing, ...patch });
            }
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: TokenRow) => ({
        run: async () => {
          tokenStore.set(row.provider, {
            provider: row.provider,
            token: row.token,
            lastSyncedAt: null,
          });
        },
      }),
    }),
  }),
  getEnv: async () => ({}),
}));

vi.mock("@/lib/services/ingest", () => ({
  ingestExternal: async (input: { sourceType: string; externalId: string }) => {
    ingestCalls.push({
      externalId: input.externalId,
      sourceType: input.sourceType,
    });
    const behavior = ingestBehavior.get(input.externalId) ?? { kind: "added" };
    if (behavior.kind === "throw") throw new Error(behavior.reason);
    if (behavior.kind === "added") return { sourceId: 1, status: "processed" };
    if (behavior.kind === "skipped")
      return { sourceId: 1, status: "skipped", reason: "duplicate" };
    return { sourceId: 1, status: "failed", error: behavior.reason };
  },
}));

beforeEach(() => {
  tokenStore.clear();
  ingestCalls.length = 0;
  ingestBehavior.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeSource(captures: NewCapture[]): IngestSource {
  return {
    provider: "readwise",
    async *fetchNew() {
      for (const c of captures) yield c;
    },
  };
}

function makeCapture(id: string, updatedAtIso?: string): NewCapture {
  return {
    externalId: id,
    title: `Title ${id}`,
    text: `Body ${id}`,
    externalUpdatedAt: updatedAtIso ? new Date(updatedAtIso) : undefined,
  };
}

async function importOrchestrator() {
  // Re-import after mocks are registered.
  return import("@/lib/services/ingest-orchestrator");
}

describe("syncIntegration", () => {
  it("returns added=0, skipped=0 when the source yields nothing", async () => {
    tokenStore.set("readwise", {
      provider: "readwise",
      token: "tok",
      lastSyncedAt: null,
    });
    const { syncIntegration } = await importOrchestrator();
    const result = await syncIntegration("readwise", fakeSource([]));
    expect(result.added).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("counts new captures as added", async () => {
    tokenStore.set("readwise", {
      provider: "readwise",
      token: "tok",
      lastSyncedAt: null,
    });
    const captures = [
      makeCapture("a", "2026-05-01T00:00:00Z"),
      makeCapture("b", "2026-05-02T00:00:00Z"),
    ];
    const { syncIntegration } = await importOrchestrator();
    const result = await syncIntegration("readwise", fakeSource(captures));
    expect(result.added).toBe(2);
    expect(result.skipped).toBe(0);
    expect(ingestCalls.map((c) => c.externalId)).toEqual(["a", "b"]);
  });

  it("counts duplicate externalIds as skipped, not added", async () => {
    tokenStore.set("readwise", {
      provider: "readwise",
      token: "tok",
      lastSyncedAt: null,
    });
    ingestBehavior.set("a", { kind: "added" });
    ingestBehavior.set("b", { kind: "skipped" });
    ingestBehavior.set("c", { kind: "skipped" });
    const captures = [makeCapture("a"), makeCapture("b"), makeCapture("c")];
    const { syncIntegration } = await importOrchestrator();
    const result = await syncIntegration("readwise", fakeSource(captures));
    expect(result.added).toBe(1);
    expect(result.skipped).toBe(2);
  });

  it("collects per-item errors without crashing the run", async () => {
    tokenStore.set("readwise", {
      provider: "readwise",
      token: "tok",
      lastSyncedAt: null,
    });
    ingestBehavior.set("good", { kind: "added" });
    ingestBehavior.set("bad", { kind: "throw", reason: "boom" });
    ingestBehavior.set("oops", { kind: "failed", reason: "processing failed" });
    const captures = [
      makeCapture("good"),
      makeCapture("bad"),
      makeCapture("oops"),
    ];
    const { syncIntegration } = await importOrchestrator();
    const result = await syncIntegration("readwise", fakeSource(captures));
    expect(result.added).toBe(1);
    expect(result.errors).toHaveLength(2);
    expect(result.errors.join(" ")).toContain("bad");
    expect(result.errors.join(" ")).toContain("oops");
  });

  it("advances lastSyncedAt to the newest externalUpdatedAt on success", async () => {
    tokenStore.set("readwise", {
      provider: "readwise",
      token: "tok",
      lastSyncedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const captures = [
      makeCapture("a", "2026-05-01T00:00:00Z"),
      makeCapture("b", "2026-05-15T00:00:00Z"),
      makeCapture("c", "2026-05-10T00:00:00Z"),
    ];
    const { syncIntegration } = await importOrchestrator();
    const result = await syncIntegration("readwise", fakeSource(captures));
    expect(result.lastSyncedAt).toBe("2026-05-15T00:00:00.000Z");
    expect(tokenStore.get("readwise")?.lastSyncedAt?.toISOString()).toBe(
      "2026-05-15T00:00:00.000Z",
    );
  });
});
