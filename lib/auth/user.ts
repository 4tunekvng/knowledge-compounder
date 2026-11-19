import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { userFromHeaders, type SignedInUser } from "./gate";

/**
 * The signed-in person, as the gate (lib/auth/gate.ts) attached them to this
 * request. Pages and routes key every read and write by `user.id`.
 */

export async function currentUser(): Promise<SignedInUser | null> {
  return userFromHeaders(await headers());
}

/** For pages: the user, or a redirect to /login. */
export async function requireUser(): Promise<SignedInUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** For API routes: the user, or null with `unauthorized()` to send back. */
export function apiUser(request: Request): SignedInUser | null {
  return userFromHeaders(request.headers);
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in first." }, { status: 401 });
}
