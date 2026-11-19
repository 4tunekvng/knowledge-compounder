/**
 * The cron half of worker.ts, kept apart from the OpenNext build it wraps
 * (which only exists after `npm run cf:build`) so it can be tested.
 *
 * Each job is a POST to one of the app's own routes, made through the app's
 * fetch handler (in-process, no network hop) instead of importing the job
 * directly. That way it runs inside OpenNext's request context, where getDb()
 * and getEnv() find the D1 binding and secrets. The request skips the sign-in
 * gate and carries the x-kc-cron header, which the gate strips from every
 * outside request, so only the cron can reach these routes. Importing the
 * services here would also make wrangler bundle the app's server code a
 * second time, outside Next's build.
 */

import { CRON_HEADER } from "./auth/gate";

type AppFetch = (request: Request, env: unknown, ctx: unknown) => Promise<Response>;

// The host is never resolved: the request goes straight to the app's handler.
const APP = "https://knowledge-compounder.internal";
export const DRAIN_URL = `${APP}/api/drain`;
export const PAPERS_CRON_URL = `${APP}/api/cron/papers`;
// The capture drain runs first; paper work never delays it.
export const CRON_JOBS = [DRAIN_URL, PAPERS_CRON_URL] as const;

async function runJob(
  url: string,
  appFetch: AppFetch,
  env: unknown,
  ctx: unknown,
): Promise<void> {
  const request = new Request(url, {
    method: "POST",
    headers: { [CRON_HEADER]: "1" },
  });
  const res = await appFetch(request, env, ctx);
  const path = new URL(url).pathname;
  if (!res.ok) {
    throw new Error(`${path} returned ${res.status}: ${await res.text()}`);
  }
  console.log(`[cron] ${path}:`, await res.text());
}

/**
 * Run every cron job in order. One job failing never stops the next; the run
 * still throws at the end so the dashboard's Cron Events list marks it failed.
 */
export async function runCronJobs(
  appFetch: AppFetch,
  env: unknown,
  ctx: unknown,
): Promise<void> {
  const failures: string[] = [];
  for (const url of CRON_JOBS) {
    try {
      await runJob(url, appFetch, env, ctx);
    } catch (err) {
      failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  if (failures.length) throw new Error(failures.join("; "));
}
