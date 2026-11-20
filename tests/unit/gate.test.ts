import { describe, expect, it, vi } from "vitest";
import {
  CRON_HEADER,
  USER_HEADER,
  gate,
  nextUrl,
  userFromHeaders,
} from "@/lib/auth/gate";

/**
 * The sign-in gate in front of the app (worker.ts). env.AUTH is a stub that
 * answers the way fortuneking-auth's internal routes do (contract v2.1), and
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

    expect(res.headers.get("location")).toBe(`${HOST}/review`);
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

const NONCE = "0123456789abcdef0123456789abcdef";

function callback(query: string, cookie = `__Host-fk_nonce=${NONCE}`) {
  return new Request(`${HOST}/auth/callback?${query}`, { headers: { cookie } });
}

describe("gate, /auth/signout", () => {
  it("revokes the sign-in with this browser's cookie", async () => {
    const AUTH = auth(new Response(null, { status: 204 }));

    await gate(get("/auth/signout"), { AUTH }, app());

    expect(AUTH.fetch).toHaveBeenCalledTimes(1);
    expect(AUTH.fetch).toHaveBeenCalledWith("https://auth.internal/revoke", {
      method: "POST",
      headers: {
        cookie: "c=1",
        "x-app-host": "knowledge-compounder.fortuneking.dev",
      },
    });
  });

  it("clears the app's cookie and signs out at the sign-in service", async () => {
    const AUTH = auth(new Response(null, { status: 204 }));

    const res = await gate(get("/auth/signout"), { AUTH }, app());

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://fortuneking.dev/auth/logout?return_to=" +
        encodeURIComponent(`${HOST}/login`),
    );
    expect(res.headers.getSetCookie()).toEqual([
      "__Host-fk_app=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("still signs out when the sign-in service is down", async () => {
    const AUTH = { fetch: vi.fn().mockRejectedValue(new Error("down")) };

    const res = await gate(get("/auth/signout"), { AUTH }, app());

    expect(res.status).toBe(302);
    expect(res.headers.getSetCookie()).toHaveLength(1);
  });
});

describe("gate, /auth/start", () => {
  it("remembers a fresh nonce here and sends it to Google sign-in", async () => {
    const res = await gate(
      new Request(`${HOST}/auth/start?next=%2Fdecks`),
      {},
      app(),
    );

    const cookie = res.headers.get("set-cookie") ?? "";
    const nonce = /^__Host-fk_nonce=([A-Za-z0-9]{16,});/.exec(cookie)?.[1];
    const location = new URL(res.headers.get("location") ?? "");
    expect(cookie).toContain("Path=/; HttpOnly; Secure; SameSite=Lax");
    expect(cookie).toContain("Max-Age=600");
    expect(location.origin + location.pathname).toBe(
      "https://fortuneking.dev/auth/login",
    );
    expect(location.searchParams.get("return_to")).toBe(`${HOST}/decks`);
    expect(location.searchParams.get("nonce")).toBe(nonce);
  });

  it.each(["/%09/evil.example", "/.//evil.example", "//evil.example"])(
    "keeps the return address on this site for next=%s",
    async (raw) => {
      const request = new Request(
        `${HOST}/auth/start?next=${encodeURIComponent(decodeURIComponent(raw))}`,
      );

      const res = await gate(request, {}, app());

      const location = new URL(res.headers.get("location") ?? "");
      const returnTo = new URL(location.searchParams.get("return_to") ?? "");
      expect(returnTo.origin).toBe(HOST);
    },
  );
});

describe("gate, /auth/callback", () => {
  it("exchanges the code with this browser's nonce", async () => {
    const setCookie = "__Host-fk_app=tok; Path=/; HttpOnly; Secure";
    const AUTH = auth(Response.json({ setCookie, user: ALICE }));

    await gate(callback("code=xyz&next=%2Fdecks"), { AUTH }, app());

    const [url, init] = AUTH.fetch.mock.calls[0];
    expect([url, init.method, init.body]).toEqual([
      "https://auth.internal/exchange",
      "POST",
      JSON.stringify({ code: "xyz", nonce: NONCE }),
    ]);
    expect(init.headers["x-app-host"]).toBe("knowledge-compounder.fortuneking.dev");
  });

  it("sets the returned cookie, clears the nonce and goes to next", async () => {
    const setCookie = "__Host-fk_app=tok; Path=/; HttpOnly; Secure";
    const AUTH = auth(Response.json({ setCookie, user: ALICE }));

    const res = await gate(callback("code=xyz&next=%2Fdecks"), { AUTH }, app());

    expect(res.headers.get("location")).toBe(`${HOST}/decks`);
    expect(res.headers.getSetCookie()).toEqual([
      setCookie,
      "__Host-fk_nonce=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it("goes back to /login, asking nothing, with no nonce cookie", async () => {
    const AUTH = signedIn();
    const request = callback("code=xyz&next=%2F", "other=1");

    const res = await gate(request, { AUTH }, app());

    expect(res.headers.get("location")).toBe(`${HOST}/login?next=%2F&error=1`);
    expect(AUTH.fetch).not.toHaveBeenCalled();
  });

  it("goes back to /login when the code is refused", async () => {
    const AUTH = auth(Response.json({ error: "invalid code" }, { status: 400 }));

    const res = await gate(callback("code=old&next=%2F"), { AUTH }, app());

    expect(res.headers.get("location")).toBe(`${HOST}/login?next=%2F&error=1`);
    expect(res.headers.getSetCookie()).toEqual([
      "__Host-fk_nonce=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax",
    ]);
  });

  it.each(["/%09/evil.example", "/.//evil.example", "//evil.example"])(
    "never leaves the site after sign-in for next=%s",
    async (raw) => {
      const AUTH = auth(Response.json({ setCookie: "a=b", user: ALICE }));
      const next = encodeURIComponent(decodeURIComponent(raw));

      const res = await gate(callback(`code=xyz&next=${next}`), { AUTH }, app());

      expect(new URL(res.headers.get("location") ?? "").origin).toBe(HOST);
    },
  );
});

describe("nextUrl", () => {
  it.each([
    ["/review?x=1", `${HOST}/review?x=1`],
    ["//evil.example", `${HOST}/`],
    ["/\\evil.example", `${HOST}/`],
    ["/\t/evil.example", `${HOST}/`],
    ["https://evil.example", `${HOST}/`],
    [`https://user:pass@${new URL(HOST).host}/review`, `${HOST}/review`],
    ["/login", `${HOST}/`],
    ["/LOGIN", `${HOST}/`],
    ["/auth/signout", `${HOST}/`],
    ["", `${HOST}/`],
    [null, `${HOST}/`],
  ])("%s -> %s", (raw, expected) => {
    expect(nextUrl(raw, HOST)).toBe(expected);
  });

  it("keeps /.//evil.example on this site", () => {
    expect(new URL(nextUrl("/.//evil.example", HOST)).origin).toBe(HOST);
  });
});

describe("gate, /api/today for the Today page", () => {
  const TODAY = "https://fortuneking.dev";

  it("answers signed out with a 401 the Today page can read", async () => {
    const next = app();

    const res = await gate(
      get("/api/today", { origin: TODAY }),
      { AUTH: signedOut() },
      next,
    );

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "signed out" });
    expect(res.headers.get("access-control-allow-origin")).toBe(TODAY);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(next).not.toHaveBeenCalled();
  });

  it("adds the Today page's headers to the signed-in answer", async () => {
    const res = await gate(
      get("/api/today", { origin: TODAY }),
      { AUTH: signedIn() },
      app(),
    );

    expect(await res.text()).toBe("app");
    expect(res.headers.get("access-control-allow-origin")).toBe(TODAY);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")).toBe("Origin");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("gives another origin no cross-site headers", async () => {
    const res = await gate(
      get("/api/today", { origin: "https://evil.example" }),
      { AUTH: signedIn() },
      app(),
    );

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("answers the preflight without a cookie or the app", async () => {
    const next = app();
    const preflight = new Request(`${HOST}/api/today`, {
      method: "OPTIONS",
      headers: { origin: TODAY, "access-control-request-method": "GET" },
    });

    const res = await gate(preflight, { AUTH: signedOut() }, next);

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(TODAY);
    expect(res.headers.get("access-control-allow-methods")).toBe("GET");
    expect(next).not.toHaveBeenCalled();
  });

  it("keeps every other route closed to the Today page", async () => {
    const res = await gate(
      get("/api/review", { origin: TODAY }),
      { AUTH: signedIn() },
      app(),
    );

    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});
