import { describe, expect, it, vi } from "vitest";
import { CRON_HEADER } from "@/lib/auth/gate";

/** Pins who may run the paper cron and how it reports a failed harvest. */

const harvestIfDue = vi.fn();
vi.mock("@/lib/papers/harvest", () => ({ harvestIfDue: () => harvestIfDue() }));

const { POST } = await import("@/app/api/cron/papers/route");
const URL = "https://knowledge-compounder.internal/api/cron/papers";

describe("POST /api/cron/papers", () => {
  it("answers 404 to anyone but the cron", async () => {
    const res = await POST(new Request(URL, { method: "POST" }));

    expect(res.status).toBe(404);
    expect(harvestIfDue).not.toHaveBeenCalled();
  });

  it("reports the harvest to the cron", async () => {
    harvestIfDue.mockResolvedValueOnce({ papersSeen: 3, failedSources: [] });

    const res = await POST(
      new Request(URL, { method: "POST", headers: { [CRON_HEADER]: "1" } }),
    );

    expect([res.status, await res.json()]).toEqual([
      200,
      { harvest: { papersSeen: 3, failedSources: [] } },
    ]);
  });

  it("fails the run when the harvest throws", async () => {
    harvestIfDue.mockRejectedValueOnce(new Error("D1 down"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(
      new Request(URL, { method: "POST", headers: { [CRON_HEADER]: "1" } }),
    );

    expect(res.status).toBe(500);
  });
});
