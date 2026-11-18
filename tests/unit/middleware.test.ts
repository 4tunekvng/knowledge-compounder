import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function request(path: string, authorization?: string): NextRequest {
  const headers = authorization ? { authorization } : undefined;
  return new NextRequest(`http://localhost${path}`, { headers });
}

function basic(password: string): string {
  return `Basic ${btoa(`owner:${password}`)}`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("middleware with KC_API_SECRET set", () => {
  it("lets the browser's sign-in password reach the API", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/api/capture", basic("s3cret")));

    expect(res.status).toBe(200);
  });

  it("asks a visitor without the password to sign in on pages", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/"));

    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic /);
  });

  it("refuses a wrong browser password", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/api/capture", basic("guess")));

    expect(res.status).toBe(401);
  });

  it("still accepts the bearer secret from scripts", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/api/capture", "Bearer s3cret"));

    expect(res.status).toBe(200);
  });

  it("lets a student without the password open a share link", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/d/0123abcd"));

    expect(res.status).toBe(200);
  });

  it("lets a student without the password download a share link's PDF", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/d/0123abcd/pdf"));

    expect(res.status).toBe(200);
  });

  it("still guards a path that only starts with the letter d", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/decks"));

    expect(res.status).toBe(401);
  });

  it("refuses malformed basic credentials", () => {
    vi.stubEnv("KC_API_SECRET", "s3cret");

    const res = middleware(request("/api/capture", "Basic !!!"));

    expect(res.status).toBe(401);
  });
});

describe("middleware with no KC_API_SECRET", () => {
  it("leaves the site open", () => {
    vi.stubEnv("KC_API_SECRET", "");

    const res = middleware(request("/api/capture"));

    expect(res.status).toBe(200);
  });
});
