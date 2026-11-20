import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Each owner API route answers with the status the service's error type
 * carries, and a plain 500 for any other error, whatever its text says.
 */

const failure = { error: new Error("unset") as unknown };
const fail = async () => {
  throw failure.error;
};
vi.mock("@/lib/services/ingest", () => ({
  retrySource: fail,
  MAX_PDF_BYTES: 1,
}));
vi.mock("@/lib/services/decks", () => ({ createDeck: fail }));
vi.mock("@/lib/services/themes", () => ({
  generateThemes: fail,
  draftEssayForTheme: fail,
}));
vi.mock("@/lib/services/review", () => ({ gradeCard: fail }));
vi.mock("@/lib/services/cards", () => ({ addMoreCards: fail }));
vi.mock("@/lib/services/ingest-orchestrator", () => ({
  syncIntegration: fail,
}));

const USER = encodeURIComponent(JSON.stringify({ id: "owner-1" }));
const params = { params: Promise.resolve({ id: "1" }) };
type Handler = (request: Request, context: typeof params) => Promise<Response>;

function call(handler: Handler, body: object): Promise<Response> {
  const request = new Request("https://kc.test/api", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-kc-user": USER },
  });
  return handler(request, params);
}

// Loaded on demand so the untyped cases still run where the module is absent.
async function serviceError(message: string, status: number) {
  const { ServiceError } = await import("@/lib/errors");
  return new ServiceError(message, status);
}

const review = async () => (await import("@/app/api/review/route")).POST;
const essay = async () => (await import("@/app/api/essay/route")).POST;
const themes = async () => (await import("@/app/api/themes/route")).POST;
const decks = async () => (await import("@/app/api/decks/route")).POST;
const retry = async () =>
  (await import("@/app/api/sources/[id]/retry/route")).POST;
const cards = async () =>
  (await import("@/app/api/sources/[id]/cards/route")).POST;
const sync = async () =>
  (await import("@/app/api/integrations/readwise/sync/route")).POST;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("typed service errors keep their status and message", () => {
  it("review answers 404", async () => {
    failure.error = await serviceError("No such card.", 404);

    const res = await call(await review(), { cardId: 1, grade: 3 });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such card." });
  });

  it("essay answers 422", async () => {
    failure.error = await serviceError("Theme is too thin.", 422);

    const res = await call(await essay(), { themeId: 1 });

    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: "Theme is too thin." });
  });

  it("decks answers 400", async () => {
    failure.error = await serviceError("Give the deck a title.", 400);

    const res = await call(await decks(), { title: "", sourceIds: [] });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Give the deck a title." });
  });

  it("retry answers 409", async () => {
    failure.error = await serviceError("Already processing.", 409);

    const res = await call(await retry(), {});

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Already processing." });
  });

  it("readwise sync answers 401 for a bad token", async () => {
    const { InvalidTokenError } = await import("@/lib/services/ingest-source");
    failure.error = new InvalidTokenError("readwise");

    const res = await call(await sync(), {});

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error:
        "Invalid token for provider 'readwise'. Re-paste the token in " +
        "/integrations.",
    });
  });
});

describe("untyped errors answer 500 even when their text looks familiar", () => {
  it("review", async () => {
    failure.error = new Error("Card not found.");

    const res = await call(await review(), { cardId: 1, grade: 3 });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error." });
  });

  it("essay", async () => {
    failure.error = new Error("Theme not found.");

    const res = await call(await essay(), { themeId: 1 });

    expect(res.status).toBe(500);
  });

  it("themes", async () => {
    failure.error = new Error("Need at least a working database connection.");

    const res = await call(await themes(), {});

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error." });
  });

  it("decks", async () => {
    failure.error = new Error("Deck title column missing (SQLITE_ERROR).");

    const res = await call(await decks(), { title: "x", sourceIds: [1] });

    expect(res.status).toBe(500);
  });

  it("retry", async () => {
    failure.error = new Error("Source not found.");

    const res = await call(await retry(), {});

    expect(res.status).toBe(500);
  });

  it("cards", async () => {
    failure.error = new Error("No new cards: upstream 529 overloaded");

    const res = await call(await cards(), {});

    expect(res.status).toBe(500);
  });

  it("readwise sync", async () => {
    failure.error = new Error("No token configured in the gateway env.");

    const res = await call(await sync(), {});

    expect(res.status).toBe(500);
  });

  it("logs the untyped error", async () => {
    const error = new Error("Card not found.");
    failure.error = error;

    await call(await review(), { cardId: 1, grade: 3 });

    expect(console.error).toHaveBeenCalledWith(expect.any(String), error);
  });
});
