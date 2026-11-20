/**
 * Cross-site reads of /api/today by the Today page at https://fortuneking.dev
 * (contract: ~/personal_projects/fortuneking-auth README, "The Today page").
 * That page fetches this route from the browser with the visitor's cookie,
 * so the answer must name its origin and allow credentials, or the browser
 * hides it, the 401 included. No other origin, and no other route, is ever
 * readable cross-site.
 *
 * Plain Fetch API code, applied by the gate (gate.ts) to every response.
 */

export const TODAY_PATH = "/api/today";
export const TODAY_ORIGIN = "https://fortuneking.dev";

/** The gate's own answer to a preflight for /api/today. */
export function todayPreflight(): Response {
  return new Response(null, { status: 204 });
}

/**
 * The response with the Today page's headers when it answers /api/today,
 * unchanged otherwise. The answer is per person, so it is never cached, and
 * `Vary: Origin` keeps a cache from mixing the two origins' answers.
 */
export function withTodayCors(request: Request, response: Response): Response {
  if (new URL(request.url).pathname !== TODAY_PATH) return response;
  const out = new Response(response.body, response);
  out.headers.append("vary", "Origin");
  out.headers.set("cache-control", "no-store");
  if (request.headers.get("origin") === TODAY_ORIGIN) {
    out.headers.set("access-control-allow-origin", TODAY_ORIGIN);
    out.headers.set("access-control-allow-credentials", "true");
    if (request.method === "OPTIONS") {
      out.headers.set("access-control-allow-methods", "GET");
    }
  }
  return out;
}
