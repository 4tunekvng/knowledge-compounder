import { describe, expect, it, vi } from "vitest";

/**
 * Second line behind the gate: every owner API route answers 401 when the
 * request carries no signed-in user, without touching the data layer, and
 * the drain answers only the cron's own request.
 */

const touched = vi.fn();
const service = (name: string) => async () => {
  touched(name);
  return {};
};
vi.mock("@/lib/services/ingest", () => ({
  ingest: service("ingest"),
  ingestPdf: service("ingestPdf"),
  retrySource: service("retrySource"),
  processPendingSources: async () => [],
  MAX_PDF_BYTES: 1,
}));
vi.mock("@/lib/services/decks", () => ({
  createDeck: service("createDeck"),
  deleteDeck: service("deleteDeck"),
}));
vi.mock("@/lib/services/themes", () => ({
  generateThemes: service("generateThemes"),
  draftEssayForTheme: service("draftEssayForTheme"),
}));
vi.mock("@/lib/services/review", () => ({ gradeCard: service("gradeCard") }));
vi.mock("@/lib/services/cards", () => ({ addMoreCards: service("addMoreCards") }));
vi.mock("@/lib/services/ingest-orchestrator", () => ({
  syncIntegration: service("syncIntegration"),
  setIntegrationToken: service("setIntegrationToken"),
  listIntegrationStatus: service("listIntegrationStatus"),
}));

const params = { params: Promise.resolve({ id: "1" }) };
type Handler = (request: Request, context: typeof params) => Promise<Response>;

const ROUTES: [string, () => Promise<Handler>][] = [
  ["POST /api/capture", async () => (await import("@/app/api/capture/route")).POST],
  ["POST /api/decks", async () => (await import("@/app/api/decks/route")).POST],
  [
    "DELETE /api/decks/1",
    async () => (await import("@/app/api/decks/[id]/route")).DELETE,
  ],
  ["POST /api/essay", async () => (await import("@/app/api/essay/route")).POST],
  ["POST /api/review", async () => (await import("@/app/api/review/route")).POST],
  ["POST /api/themes", async () => (await import("@/app/api/themes/route")).POST],
  [
    "POST /api/sources/1/cards",
    async () => (await import("@/app/api/sources/[id]/cards/route")).POST,
  ],
  [
    "POST /api/sources/1/retry",
    async () => (await import("@/app/api/sources/[id]/retry/route")).POST,
  ],
  [
    "POST /api/integrations/readwise/sync",
    async () => (await import("@/app/api/integrations/readwise/sync/route")).POST,
  ],
  [
    "POST /api/integrations/readwise/token",
    async () => (await import("@/app/api/integrations/readwise/token/route")).POST,
  ],
  [
    "GET /api/integrations/status",
    async () => (await import("@/app/api/integrations/status/route")).GET,
  ],
];

describe("owner API routes with no signed-in user", () => {
  it.each(ROUTES)("%s answers 401", async (_name, load) => {
    const handler = await load();
    const request = new Request("https://kc.test/api", {
      method: "POST",
      body: JSON.stringify({ input: "x", token: "abcdefghij", cardId: 1 }),
      headers: { "content-type": "application/json" },
    });

    const res = await handler(request, params);

    expect(res.status).toBe(401);
    expect(touched).not.toHaveBeenCalled();
  });
});

describe("POST /api/drain", () => {
  it("is not found for any request but the cron's", async () => {
    const { POST } = await import("@/app/api/drain/route");

    const request = new Request("https://kc.test/api/drain", { method: "POST" });

    const res = await POST(request);

    expect(res.status).toBe(404);
  });

  it("drains for the cron's request", async () => {
    const { POST } = await import("@/app/api/drain/route");
    const request = new Request("https://kc.test/api/drain", {
      method: "POST",
      headers: { "x-kc-cron": "1" },
    });

    const res = await POST(request);

    expect(res.status).toBe(200);
  });
});
