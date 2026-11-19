/**
 * Seal integration tokens (a person's Readwise key) before they are stored,
 * so a copy of the database alone doesn't hand anyone their accounts.
 *
 * AES-GCM with a 256-bit key from the KC_TOKEN_KEY Worker secret (base64,
 * `openssl rand -base64 32`). The owner and provider are bound in as
 * additional data, so a sealed token copied onto another person's row fails
 * to open instead of working for them.
 *
 * Stored form: "v1.<iv base64>.<ciphertext base64>".
 */

const VERSION = "v1";

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function importKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new Error("KC_TOKEN_KEY is not set.");
  const raw = fromBase64(secret);
  if (raw.byteLength !== 32) {
    throw new Error("KC_TOKEN_KEY must be 32 bytes, base64-encoded.");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function context(ownerId: string, provider: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(`${ownerId}\n${provider}`);
}

export async function sealToken(
  plain: string,
  secret: string | undefined,
  owner: { ownerId: string; provider: string },
): Promise<string> {
  const key = await importKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: context(owner.ownerId, owner.provider),
    },
    key,
    new TextEncoder().encode(plain),
  );
  return [VERSION, toBase64(iv), toBase64(new Uint8Array(sealed))].join(".");
}

/** The token, or null when the value is not one this key sealed for them. */
export async function openToken(
  stored: string,
  secret: string | undefined,
  owner: { ownerId: string; provider: string },
): Promise<string | null> {
  const key = await importKey(secret);
  const [version, iv, body] = stored.split(".");
  if (version !== VERSION || !iv || !body) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64(iv),
        additionalData: context(owner.ownerId, owner.provider),
      },
      key,
      fromBase64(body),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
