import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optional shared-secret guard for all /api/* routes.
 *
 * Set KC_API_SECRET in your environment to gate API access. When unset the
 * middleware skips the check so local dev and single-device personal deploys
 * work without configuration.
 *
 * Callers send the secret as:
 *   Authorization: Bearer <KC_API_SECRET>
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

export function middleware(request: NextRequest) {
  const secret = process.env.KC_API_SECRET;
  if (!secret) return NextResponse.next();

  const auth = request.headers.get("authorization");
  const presented = auth?.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  if (!timingSafeEqual(presented, secret)) {
    return NextResponse.json(
      { error: "Unauthorized. Set the Authorization: Bearer <KC_API_SECRET> header." },
      { status: 401 },
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
