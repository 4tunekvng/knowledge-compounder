/**
 * Sign-in gate for every request the Worker receives (worker.ts), in front
 * of the Next.js app. It asks fortuneking-auth who the visitor is through
 * the AUTH service binding (contract v2.1: ~/personal_projects/fortuneking-auth
 * README) and hands the app the answer in one header the visitor can't
 * forge, because the gate deletes every `x-kc-*` header a request arrives
 * with before it sets its own.
 *
 *   signed out, page      -> 302 /login?next=<path>
 *   signed out, /api/...  -> 401 JSON
 *   signed in             -> app, with x-kc-user: <the user, URI-encoded JSON>
 *   /auth/signout         -> revoke the sign-in, clear the app's cookie,
 *                            then the service's sign-out
 *   /d/<token> (share links), /login, /auth/start, /auth/callback -> public
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
// The sign-in service's browser-facing address. It sits on the bare domain:
// Cloudflare refuses a subdomain request that arrives on a connection Chrome
// opened for another fortuneking.dev name.
export const AUTH_BASE = "https://fortuneking.dev/auth";
// Only the AUTH binding reaches this host; public traffic can't.
const AUTH_INTERNAL = "https://auth.internal";

/** Who the visitor is, set only by this gate. */
export const USER_HEADER = "x-kc-user";
/** Marks the cron's own drain request (lib/scheduled.ts), set only there. */
export const CRON_HEADER = "x-kc-cron";
const INTERNAL_HEADER_PREFIX = "x-kc-";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Ties a sign-in to the browser that started it (contract v2.1). */
const NONCE_COOKIE = "__Host-fk_nonce";
/** The app's own sign-in cookie, made by the service at /exchange. */
const APP_COOKIE = "__Host-fk_app";
const COOKIE_ATTRS = "Path=/; HttpOnly; Secure; SameSite=Lax";

/** The "Sign out" link: the gate's own route, below. */
export const SIGN_OUT_PATH = "/auth/signout";

/**
 * Where to send someone after sign-in: `next` resolved against this app's
 * origin, as an absolute URL, or the app's home page when it resolves to
 * another site. A string check ("starts with / and not //") is not enough:
 * browsers drop tabs and newlines and resolve dot segments, so "/\t/x" and
 * "/.//x" would pass it and leave the site.
 */
export function nextUrl(raw: string | null | undefined, origin: string): string {
  try {
    const dest = new URL(raw || "/", origin);
    if (dest.origin === origin) return dest.href;
  } catch {
    // Not a URL at all: fall through to home.
  }
  return `${origin}/`;
}

function cookieValue(request: Request, name: string): string | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

function signOutUrl(host: string): string {
  const returnTo = `https://${host}/login`;
  return `${AUTH_BASE}/logout?return_to=${encodeURIComponent(returnTo)}`;
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

/**
 * GET /auth/start?next=…: remember a fresh nonce in this browser, then go to
 * Google sign-in, which hands the nonce back inside the one-time code.
 */
function authStart(url: URL): Response {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const returnTo = nextUrl(url.searchParams.get("next"), url.origin);
  const login =
    `${AUTH_BASE}/login?return_to=${encodeURIComponent(returnTo)}` +
    `&nonce=${nonce}`;
  return redirect(login, {
    "set-cookie": `${NONCE_COOKIE}=${nonce}; Max-Age=600; ${COOKIE_ATTRS}`,
  });
}

/**
 * GET /auth/callback?code=…&next=…: trade the one-time code, with this
 * browser's nonce, for the app's own sign-in cookie.
 */
async function authCallback(
  request: Request,
  url: URL,
  env: AuthEnv,
): Promise<Response> {
  const next = url.searchParams.get("next") ?? "/";
  const clearNonce = `${NONCE_COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`;
  const back = redirect(
    `${url.origin}/login?next=${encodeURIComponent(next)}&error=1`,
    { "set-cookie": clearNonce },
  );
  const code = url.searchParams.get("code");
  const nonce = cookieValue(request, NONCE_COOKIE);
  if (!code || !nonce || !env.AUTH) return back;
  const res = await env.AUTH.fetch(`${AUTH_INTERNAL}/exchange`, {
    method: "POST",
    headers: { "x-app-host": url.host, "content-type": "application/json" },
    body: JSON.stringify({ code, nonce }),
  });
  if (!res.ok) return back;
  const { setCookie } = (await res.json()) as { setCookie?: unknown };
  if (typeof setCookie !== "string" || !setCookie) return back;
  const headers = new Headers({ "set-cookie": setCookie });
  headers.append("set-cookie", clearNonce);
  return redirect(nextUrl(next, url.origin), headers);
}

/**
 * GET /auth/signout: end the sign-in this browser's cookie came from (which
 * signs out every app, even when the service's own cookie has expired),
 * clear the app's cookie, then sign out at the service. Revoking is best
 * effort: if the service can't be reached, signing out here still happens.
 */
async function authSignOut(
  request: Request,
  url: URL,
  env: AuthEnv,
): Promise<Response> {
  const cookie = request.headers.get("cookie");
  if (cookie && env.AUTH) {
    try {
      const res = await env.AUTH.fetch(`${AUTH_INTERNAL}/revoke`, {
        method: "POST",
        headers: { cookie, "x-app-host": url.host },
      });
      if (res.status !== 204) console.error("[gate] revoke answered", res.status);
    } catch (err) {
      console.error("[gate] revoke failed:", err);
    }
  }
  return redirect(signOutUrl(url.host), {
    "set-cookie": `${APP_COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}`,
  });
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

  if (url.pathname === "/auth/start") return authStart(url);
  if (url.pathname === "/auth/callback") return authCallback(request, url, env);
  if (url.pathname === SIGN_OUT_PATH) return authSignOut(request, url, env);
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
    if (user) return redirect(nextUrl(url.searchParams.get("next"), url.origin));
    return next(forwarded(request));
  }
  if (!user) {
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Sign in first." }, { status: 401 });
    }
    const path = `${url.pathname}${url.search}`;
    return redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  const value = encodeURIComponent(JSON.stringify(user));
  return next(forwarded(request, [USER_HEADER, value]));
}
