/**
 * Sign-in gate for every request the Worker receives (worker.ts), in front
 * of the Next.js app. It asks fortuneking-auth who the visitor is through
 * the AUTH service binding (contract v2: ~/personal_projects/fortuneking-auth
 * README) and hands the app the answer in one header the visitor can't
 * forge, because the gate deletes every `x-kc-*` header a request arrives
 * with before it sets its own.
 *
 *   signed out, page      -> 302 /login?next=<path>
 *   signed out, /api/...  -> 401 JSON
 *   signed in             -> app, with x-kc-user: <the user, URI-encoded JSON>
 *   /d/<token> (share links), /login, /auth/callback -> public
 *
 * Kept free of Next.js imports so it runs, and is tested, as plain Fetch
 * API code.
 */

export interface SignedInUser {
  id: string;
  email: string;
  name: string;
  picture: string;
}

interface Fetcher {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface AuthEnv {
  AUTH?: Fetcher;
}

type Next = (request: Request) => Promise<Response>;

export const APP_HOST = "knowledge-compounder.fortuneking.dev";
export const AUTH_ORIGIN = "https://auth.fortuneking.dev";
// Only the AUTH binding reaches this host; public traffic can't.
const AUTH_INTERNAL = "https://auth.internal";

/** Who the visitor is, set only by this gate. */
export const USER_HEADER = "x-kc-user";
/** Marks the cron's own drain request (lib/scheduled.ts), set only there. */
export const CRON_HEADER = "x-kc-cron";
const INTERNAL_HEADER_PREFIX = "x-kc-";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A same-site path to send someone to after sign-in. Anything else ("//x",
 * "/\\x", "https://x", empty) becomes "/", so the page can't be used to
 * bounce a visitor to another site. Browsers drop tabs and newlines from a
 * Location ("/\t/x" becomes "//x") and read "\\" as "/", so any control
 * character or backslash is refused too.
 */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return "/";
  return raw;
}

/** The Google sign-in link for the page at `next` on `host`. */
export function googleSignInUrl(host: string, next: string): string {
  const returnTo = `https://${host}${safeNext(next)}`;
  return `${AUTH_ORIGIN}/login?return_to=${encodeURIComponent(returnTo)}`;
}

export function signOutUrl(host: string): string {
  const returnTo = `https://${host}/login`;
  return `${AUTH_ORIGIN}/logout?return_to=${encodeURIComponent(returnTo)}`;
}

/** The user the gate attached to this request, or null. */
export function userFromHeaders(headers: Headers): SignedInUser | null {
  const raw = headers.get(USER_HEADER);
  if (!raw) return null;
  try {
    return parseUser(JSON.parse(decodeURIComponent(raw)));
  } catch {
    return null;
  }
}

function parseUser(value: unknown): SignedInUser | null {
  const u = value as Partial<Record<keyof SignedInUser, unknown>> | null;
  if (!u || typeof u.id !== "string" || u.id.length === 0) return null;
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: u.id,
    email: text(u.email),
    name: text(u.name),
    picture: text(u.picture),
  };
}

// Share links carry their own unguessable token; the icon carries no data.
function isPublic(pathname: string): boolean {
  return pathname.startsWith("/d/") || pathname === "/favicon.ico";
}

function redirect(location: string, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra);
  headers.set("location", location);
  headers.set("cache-control", "no-store");
  return new Response(null, { status: 302, headers });
}

/** The request with every x-kc-* header removed, plus `set` if given. */
function forwarded(request: Request, set?: [string, string]): Request {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) {
    if (name.startsWith(INTERNAL_HEADER_PREFIX)) headers.delete(name);
  }
  if (set) headers.set(set[0], set[1]);
  return new Request(request, { headers });
}

async function sessionUser(
  request: Request,
  env: AuthEnv,
  host: string,
): Promise<SignedInUser | null> {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  if (!env.AUTH) throw new Error("AUTH service binding is missing.");
  const res = await env.AUTH.fetch(`${AUTH_INTERNAL}/session`, {
    headers: { cookie, "x-app-host": host },
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Sign-in service answered ${res.status}.`);
  const body = (await res.json()) as { user?: unknown };
  return parseUser(body.user);
}

/** GET /auth/callback?code=…&next=…: trade the one-time code for a cookie. */
async function authCallback(url: URL, env: AuthEnv): Promise<Response> {
  const next = safeNext(url.searchParams.get("next"));
  const back = `/login?next=${encodeURIComponent(next)}&error=1`;
  const code = url.searchParams.get("code");
  if (!code || !env.AUTH) return redirect(back);
  const res = await env.AUTH.fetch(`${AUTH_INTERNAL}/exchange`, {
    method: "POST",
    headers: { "x-app-host": url.host, "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) return redirect(back);
  const { setCookie } = (await res.json()) as { setCookie?: unknown };
  if (typeof setCookie !== "string" || !setCookie) return redirect(back);
  return redirect(next, { "set-cookie": setCookie });
}

export async function gate(
  request: Request,
  env: AuthEnv,
  next: Next,
): Promise<Response> {
  const url = new URL(request.url);

  // The sign-in cookie exists only on the app's own address.
  if (url.hostname.endsWith(".workers.dev")) {
    return redirect(`https://${APP_HOST}${url.pathname}${url.search}`);
  }

  // Every app on fortuneking.dev is "same site", so SameSite cookies alone
  // don't stop a sibling app's page from posting here.
  const origin = request.headers.get("origin");
  if (!SAFE_METHODS.has(request.method) && origin && origin !== url.origin) {
    return Response.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  if (url.pathname === "/auth/callback") return authCallback(url, env);
  if (isPublic(url.pathname)) return next(forwarded(request));

  let user: SignedInUser | null;
  try {
    user = await sessionUser(request, env, url.host);
  } catch (err) {
    console.error("[gate] session check failed:", err);
    return new Response("Sign-in is unavailable right now. Try again soon.", {
      status: 503,
      headers: { "retry-after": "30" },
    });
  }

  if (url.pathname === "/login") {
    if (user) return redirect(safeNext(url.searchParams.get("next")));
    return next(forwarded(request));
  }
  if (!user) {
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Sign in first." }, { status: 401 });
    }
    const path = safeNext(`${url.pathname}${url.search}`);
    return redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  const value = encodeURIComponent(JSON.stringify(user));
  return next(forwarded(request, [USER_HEADER, value]));
}
