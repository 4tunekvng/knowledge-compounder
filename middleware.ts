import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional shared-secret guard for the whole site.
 *
 * Set KC_API_SECRET to lock a deploy. When unset the middleware skips the
 * check so local dev and single-device personal deploys work without
 * configuration. When set, a request passes with either:
 *   Authorization: Bearer <KC_API_SECRET>    (scripts)
 *   Basic auth with KC_API_SECRET as the password, any user name (browsers)
 * Anything else gets a 401 that makes the browser show its own sign-in
 * prompt. The browser then resends the password on every same-site request,
 * including the components' fetch("/api/...") calls, which send no header of
 * their own.
 */

/**
 * Timing-safe string comparison for the edge runtime (no Node.js crypto).
 *
 * XORs every byte pair in constant time before checking the aggregate, so
 * the loop duration does not reveal a character-by-character match.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

function presentedSecret(auth: string | null): string {
  const [scheme = "", value = ""] = auth?.trim().split(/\s+/, 2) ?? [];
  if (scheme.toLowerCase() === "bearer") return value;
  if (scheme.toLowerCase() !== "basic") return "";
  try {
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(value), (c) => c.charCodeAt(0)),
    );
    const colon = decoded.indexOf(":");
    return colon === -1 ? "" : decoded.slice(colon + 1);
  } catch {
    return "";
  }
}

export function middleware(request: NextRequest) {
  const secret = process.env.KC_API_SECRET;
  if (!secret) return NextResponse.next();

  const presented = presentedSecret(request.headers.get("authorization"));
  if (!timingSafeEqual(presented, secret)) {
    return NextResponse.json(
      {
        error:
          "Unauthorized. Sign in, or send Authorization: Bearer <KC_API_SECRET>.",
      },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="knowledge-compounder"' },
      },
    );
  }
  return NextResponse.next();
}

export const config = {
  // Every page and API route; static build files carry no data.
  matcher: "/((?!_next/static|_next/image|favicon.ico).*)",
};
