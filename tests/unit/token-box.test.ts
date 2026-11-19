import { describe, expect, it } from "vitest";
import { openToken, sealToken } from "@/lib/token-box";

const KEY = Buffer.alloc(32, 1).toString("base64");
const OTHER_KEY = Buffer.alloc(32, 2).toString("base64");
const ALICE = { ownerId: "alice", provider: "readwise" };
const BOB = { ownerId: "bob", provider: "readwise" };

describe("token box", () => {
  it("opens what it sealed", async () => {
    const sealed = await sealToken("rw-secret-token", KEY, ALICE);

    expect(await openToken(sealed, KEY, ALICE)).toBe("rw-secret-token");
  });

  it("never stores the token in the clear", async () => {
    const sealed = await sealToken("rw-secret-token", KEY, ALICE);

    expect(sealed).not.toContain("rw-secret-token");
    expect(sealed.startsWith("v1.")).toBe(true);
  });

  it("refuses a sealed token copied onto another person's row", async () => {
    const sealed = await sealToken("rw-secret-token", KEY, ALICE);

    expect(await openToken(sealed, KEY, BOB)).toBeNull();
  });

  it("refuses a token sealed with another key", async () => {
    const sealed = await sealToken("rw-secret-token", OTHER_KEY, ALICE);

    expect(await openToken(sealed, KEY, ALICE)).toBeNull();
  });

  it("refuses a token stored in plain text before sealing existed", async () => {
    expect(await openToken("plain-old-token", KEY, ALICE)).toBeNull();
  });

  it("fails loudly when the key is missing", async () => {
    await expect(sealToken("t", undefined, ALICE)).rejects.toThrow(
      "KC_TOKEN_KEY is not set.",
    );
  });
});
