import { beforeEach, describe, expect, it, vi } from "vitest";
import { CRON_HEADER } from "@/lib/auth/gate";

/** Pins who may run the paper cron and how it reports a failed harvest. */

const harvestIfDue = vi.fn();
const rankActiveMembers = vi.fn();
vi.mock("@/lib/papers/harvest", () => ({ harvestIfDue: () => harvestIfDue() }));
vi.mock("@/lib/papers/readers", () => ({
  rankActiveMembers: (...a: unknown[]) => rankActiveMembers(...a),
}));

const { POST } = await import("@/app/api/cron/papers/route");
const URL = "https://knowledge-compounder.internal/api/cron/papers";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/cron/papers", () => {
  it("answers 404 to anyone but the cron", async () => {
    const res = await POST(new Request(URL, { method: "POST" }));

    expect(res.status).toBe(404);
    expect(harvestIfDue).not.toHaveBeenCalled();
  });

  it("harvests, then ranks people, and reports both", async () => {
    harvestIfDue.mockResolvedValueOnce({ papersSeen: 3, failedSources: [] });
    rankActiveMembers.mockResolvedValueOnce(2);

    const res = await POST(
      new Request(URL, { method: "POST", headers: { [CRON_HEADER]: "1" } }),
    );

    expect([res.status, await res.json()]).toEqual([
      200,
      { harvest: { papersSeen: 3, failedSources: [] }, ranked: 2 },
    ]);
  });

  it("still ranks people when the harvest throws, then fails the run", async () => {
    harvestIfDue.mockRejectedValueOnce(new Error("D1 down"));
    rankActiveMembers.mockResolvedValueOnce(1);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      new Request(URL, { method: "POST", headers: { [CRON_HEADER]: "1" } }),
    );

    expect([res.status, rankActiveMembers.mock.calls.length]).toEqual([500, 1]);
  });
});
