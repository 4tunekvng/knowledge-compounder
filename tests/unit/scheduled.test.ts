import { describe, expect, it, vi } from "vitest";
import { CRON_HEADER } from "@/lib/auth/gate";
import { DRAIN_URL, PAPERS_CRON_URL, runCronJobs } from "@/lib/scheduled";

/**
 * The cron handler worker.ts runs. The app's fetch handler is a spy that
 * records each request and answers the way the routes would.
 */

type AppFetch = (r: Request, e: unknown, c: unknown) => Promise<Response>;

describe("runCronJobs", () => {
  it("drains captures, then runs paper work, as cron requests", async () => {
    const appFetch = vi.fn<AppFetch>(async () => Response.json({ ok: true }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const env = {};

    await runCronJobs(appFetch, env, {});

    const requests = appFetch.mock.calls.map(([r]) => r);
    expect(requests.map((r) => [r.method, r.url])).toEqual([
      ["POST", DRAIN_URL],
      ["POST", PAPERS_CRON_URL],
    ]);
    expect(requests.map((r) => r.headers.get(CRON_HEADER))).toEqual(["1", "1"]);
    expect(appFetch.mock.calls[0][1]).toBe(env);
  });

  it("still runs paper work when the drain fails, then fails the run", async () => {
    const appFetch = vi
      .fn<AppFetch>()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(runCronJobs(appFetch, {}, {})).rejects.toThrow(
      "/api/drain returned 401: Unauthorized",
    );
    expect(appFetch).toHaveBeenCalledTimes(2);
  });
});
