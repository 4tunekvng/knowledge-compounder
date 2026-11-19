import { describe, expect, it, vi } from "vitest";
import {
  CRON_HEADER,
  USER_HEADER,
  gate,
  safeNext,
  userFromHeaders,
} from "@/lib/auth/gate";

/**
 * The sign-in gate in front of the app (worker.ts). env.AUTH is a stub that
 * answers the way fortuneking-auth's internal routes do (contract v2), and
 * `next` is a spy standing in for the Next.js app.
 */

const HOST = "https://knowledge-compounder.fortuneking.dev";
const ALICE = {
  id: "111796540707500759177",
  email: "a@example.com",
  name: "Ada Lovelace",
  picture: "https://lh3.googleusercontent.com/a",
};

function auth(answer: Response) {
  return { fetch: vi.fn().mockResolvedValue(answer) };
}

const signedIn = () => auth(Response.json({ user: ALICE }));
const signedOut = () => auth(Response.json({ user: null }, { status: 401 }));

function app() {
  return vi.fn<(request: Request) => Promise<Response>>(
    async () => new Response("app"),
  );
}

function get(path: string, headers: Record<string, string> = {}) {
  return new Request(`${HOST}${path}`, { headers: { cookie: "c=1", ...headers } });
}

describe("gate, signed out", () => {
  it("redirects a page to /login with the page it wanted", async () => {
    const next = app();

    const res = await gate(get("/library?x=1"), { AUTH: signedOut() }, next);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login?next=%2Flibrary%3Fx%3D1");
    expect(next).not.toHaveBeenCalled();
  });

  it("answers an API route with 401 JSON", async () => {
    const next = app();

    const res = await gate(get("/api/review"), { AUTH: signedOut() }, next);

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Sign in first." });
    expect(next).not.toHaveBeenCalled();
  });

  it("redirects with no cookie, without asking the sign-in service", async () => {
    const AUTH = signedIn();
    const request = new Request(`${HOST}/`);

    const res = await gate(request, { AUTH }, app());

    expect(res.status).toBe(302);
    expect(AUTH.fetch).not.toHaveBeenCalled();
  });

  it("serves the login page", async () => {
    const next = app();

    const res = await gate(get("/login"), { AUTH: signedOut() }, next);

    expect(await res.text()).toBe("app");
  });

  it("keeps share links public", async () => {
    const AUTH = signedOut();
    const next = app();

    const res = await gate(get("/d/abc123/anki"), { AUTH }, next);

    expect(await res.text()).toBe("app");
    expect(AUTH.fetch).not.toHaveBeenCalled();
  });
});

describe("gate, signed in", () => {
  it("asks /session with the cookie and this app's host", async () => {
    const AUTH = signedIn();

    await gate(get("/"), { AUTH }, app());

    const [url, init] = AUTH.fetch.mock.calls[0];
    expect(url).toBe("https://auth.internal/session");
    expect(init.headers).toEqual({
      cookie: "c=1",
      "x-app-host": "knowledge-compounder.fortuneking.dev",
    });
  });

  it("hands the app the user in the user header", async () => {
    const next = app();

    await gate(get("/"), { AUTH: signedIn() }, next);

    expect(userFromHeaders(next.mock.calls[0][0].headers)).toEqual(ALICE);
  });

  it("replaces a user header the visitor sent with the real one", async () => {
    const forged = encodeURIComponent(JSON.stringify({ id: "someone-else" }));
    const next = app();

    await gate(get("/", { [USER_HEADER]: forged }), { AUTH: signedIn() }, next);

    expect(userFromHeaders(next.mock.calls[0][0].headers)?.id).toBe(ALICE.id);
  });

  it("strips the cron header so no visitor can run the drain", async () => {
    const next = app();
    const request = new Request(`${HOST}/api/drain`, {
      method: "POST",
      headers: { cookie: "c=1", [CRON_HEADER]: "1" },
    });

    await gate(request, { AUTH: signedIn() }, next);

    expect(next.mock.calls[0][0].headers.has(CRON_HEADER)).toBe(false);
  });

  it("strips a forged user header on public share links", async () => {
    const next = app();
    const forged = encodeURIComponent(JSON.stringify(ALICE));

    await gate(get("/d/abc", { [USER_HEADER]: forged }), {}, next);

    expect(next.mock.calls[0][0].headers.has(USER_HEADER)).toBe(false);
  });

  it("sends a signed-in visitor on /login to the page they wanted", async () => {
    const request = get("/login?next=%2Freview");

    const res = await gate(request, { AUTH: signedIn() }, app());

    expect(res.headers.get("location")).toBe("/review");
  });
});

describe("gate, cross-site requests and other hosts", () => {
  it("refuses a POST from another origin", async () => {
    const next = app();
    const request = new Request(`${HOST}/api/capture`, {
      method: "POST",
      headers: { cookie: "c=1", origin: "https://leggo.fortuneking.dev" },
    });

    const res = await gate(request, { AUTH: signedIn() }, next);

    expect(res.status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("lets a POST from its own origin through", async () => {
    const request = new Request(`${HOST}/api/capture`, {
      method: "POST",
      headers: { cookie: "c=1", origin: HOST },
    });

    const res = await gate(request, { AUTH: signedIn() }, app());

    expect(await res.text()).toBe("app");
  });

  it("sends workers.dev visitors to the fortuneking.dev address", async () => {
    const request = new Request(
      "https://knowledge-compounder.fortunee.workers.dev/review?a=1",
    );

    const res = await gate(request, {}, app());

    expect(res.headers.get("location")).toBe(`${HOST}/review?a=1`);
  });

  it("answers 503, not a sign-in loop, when the sign-in service fails", async () => {
    const res = await gate(
      get("/"),
      { AUTH: auth(new Response("down", { status: 500 })) },
      app(),
    );

    expect(res.status).toBe(503);
  });
});

describe("gate, /auth/callback", () => {
  it("exchanges the code, sets the returned cookie and goes to next", async () => {
    const setCookie = "__Host-fk_app=tok; Path=/; HttpOnly; Secure";
    const AUTH = auth(Response.json({ setCookie, user: ALICE }));
    const request = new Request(`${HOST}/auth/callback?code=xyz&next=%2Fdecks`);

    const res = await gate(request, { AUTH }, app());

    const [url, init] = AUTH.fetch.mock.calls[0];
    expect([url, init.method, init.body]).toEqual([
      "https://auth.internal/exchange",
      "POST",
      JSON.stringify({ code: "xyz" }),
    ]);
    expect(init.headers["x-app-host"]).toBe("knowledge-compounder.fortuneking.dev");
    expect(res.headers.get("location")).toBe("/decks");
    expect(res.headers.get("set-cookie")).toBe(setCookie);
  });

  it("goes back to /login when the code is refused", async () => {
    const AUTH = auth(Response.json({ error: "invalid code" }, { status: 400 }));
    const request = new Request(`${HOST}/auth/callback?code=old&next=%2F`);

    const res = await gate(request, { AUTH }, app());

    expect(res.headers.get("location")).toBe("/login?next=%2F&error=1");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("never redirects off the site after sign-in", async () => {
    const AUTH = auth(Response.json({ setCookie: "a=b", user: ALICE }));
    const request = new Request(
      `${HOST}/auth/callback?code=xyz&next=%2F%2Fevil.example`,
    );

    const res = await gate(request, { AUTH }, app());

    expect(res.headers.get("location")).toBe("/");
  });
});

describe("safeNext", () => {
  it.each([
    ["/review?x=1", "/review?x=1"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/\t/evil.example", "/"],
    ["/ok\n/x", "/"],
    ["https://evil.example", "/"],
    ["", "/"],
    [null, "/"],
  ])("%s -> %s", (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });
});
