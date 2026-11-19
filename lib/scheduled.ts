/**
 * The cron half of worker.ts, kept apart from the OpenNext build it wraps
 * (which only exists after `npm run cf:build`) so it can be tested.
 *
 * It calls POST /api/drain through the app's own fetch handler (in-process,
 * no network hop) instead of importing the drain directly. That way the
 * drain runs inside OpenNext's request context, where getDb() and getEnv()
 * find the D1 binding and secrets, and passes the same KC_API_SECRET check
 * as every other request. Importing the services here would also make
 * wrangler bundle the app's server code a second time, outside Next's build.
 */

type AppFetch = (
  request: Request,
  env: unknown,
  ctx: unknown,
) => Promise<Response>;

// The host is never resolved: the request goes straight to the app's handler.
export const DRAIN_URL = "https://knowledge-compounder.internal/api/drain";

export async function drainThroughApp(
  appFetch: AppFetch,
  env: { KC_API_SECRET?: string },
  ctx: unknown,
): Promise<void> {
  const headers: Record<string, string> = env.KC_API_SECRET
    ? { Authorization: `Bearer ${env.KC_API_SECRET}` }
    : {};
  const res = await appFetch(
    new Request(DRAIN_URL, { method: "POST", headers }),
    env,
    ctx,
  );
  // Throwing marks this run failed in the dashboard's Cron Events list.
  if (!res.ok) {
    throw new Error(`Drain returned ${res.status}: ${await res.text()}`);
  }
  console.log("[cron] drain:", await res.text());
}
