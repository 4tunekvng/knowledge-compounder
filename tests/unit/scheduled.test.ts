import { describe, expect, it, vi } from "vitest";
import { CRON_HEADER } from "@/lib/auth/gate";
import { DRAIN_URL, drainThroughApp } from "@/lib/scheduled";

/**
 * The cron handler worker.ts runs. The app's fetch handler is a spy that
 * records the request and answers the way the drain route would.
 */

describe("drainThroughApp", () => {
  it("asks the app to drain, marked as the cron's own request", async () => {
    const appFetch = vi.fn().mockResolvedValue(Response.json({ results: [] }));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const env = {};

    await drainThroughApp(appFetch, env, {});

    const [request, passedEnv] = appFetch.mock.calls[0];
    expect([request.method, request.url]).toEqual(["POST", DRAIN_URL]);
    expect(request.headers.get(CRON_HEADER)).toBe("1");
    expect(passedEnv).toBe(env);
  });

  it("fails the cron run when the drain fails", async () => {
    const appFetch = vi
      .fn()
      .mockResolvedValue(new Response("Unauthorized", { status: 401 }));

    await expect(drainThroughApp(appFetch, {}, {})).rejects.toThrow(
      "Drain returned 401: Unauthorized",
    );
  });
});
