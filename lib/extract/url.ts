import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { DERIVED_TITLE_MAX } from "@/lib/format";
import { CaptureError } from "@/lib/errors";

export interface ExtractedDoc {
  title: string;
  text: string;
  excerpt: string;
}

const MAX_CHARS = 60_000;
// Hard limit on how many bytes we will read from a remote URL before aborting.
// Prevents a slow or large response from exhausting Cloudflare Worker memory.
// 2 MB is enough for the largest HTML pages we'd reasonably process.
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024; // 2 MB

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function extractFromHtml(html: string, _url?: string): ExtractedDoc {
  // linkedom is Workers-compatible (jsdom isn't — it depends on MessagePort).
  // The Readability lib only needs `document`, not a full BOM.
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const parsed = reader.parse();
  if (!parsed) {
    return fallback(html);
  }
  const text = (parsed.textContent ?? "").trim().slice(0, MAX_CHARS);
  return {
    title: (parsed.title ?? deriveTitle(text)).trim() || "Untitled",
    text,
    excerpt: makeExcerpt(parsed.excerpt, text),
  };
}

/**
 * Block requests to private / link-local / loopback addresses to prevent SSRF.
 * Covers: 127.x, 10.x, 172.16-31.x, 192.168.x, 169.254.x (AWS metadata),
 * IPv6 loopback (::1), IPv4-mapped IPv6 (::ffff:…), other IPv6, and "localhost".
 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, ""); // strip IPv6 brackets and trailing dot
  if (h === "localhost" || h === "::1") return true;
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — recurse on the embedded IPv4 address.
  if (h.startsWith("::ffff:")) return isPrivateHost(h.slice(7));
  // Block all remaining IPv6 addresses (fc00::/7 ULA, fe80:: link-local, etc.)
  if (h.includes(":")) return true;
  return isPrivateIPv4(integerToDotted(h) ?? h);
}

// Blocked IPv4 ranges as [first octet, lowest second octet, highest second octet].
const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [number, number, number]> = [
  [127, 0, 255], // 127.0.0.0/8 loopback
  [10, 0, 255], // 10.0.0.0/8 private
  [192, 168, 168], // 192.168.0.0/16 private
  [172, 16, 31], // 172.16.0.0/12 private
  [169, 254, 254], // 169.254.0.0/16 link-local / metadata
  [0, 0, 255], // 0.0.0.0/8
];

function isPrivateIPv4(h: string): boolean {
  const parts = h.split(".").map(Number);
  if (parts.length !== 4 || !parts.every((n) => n >= 0 && n <= 255)) return false;
  const [a, b] = parts;
  return PRIVATE_IPV4_RANGES.some(([first, low, high]) =>
    a === first && b >= low && b <= high,
  );
}

/**
 * Integer-encoded IPv4 (e.g. http://2130706433/ == 127.0.0.1) as dotted form,
 * or null when `h` is not one. parseInt("0177", 10) = 177, so octal notation
 * falls through to the dotted check.
 */
function integerToDotted(h: string): string | null {
  if (!/^\d+$/.test(h)) return null;
  const asInt = parseInt(h, 10);
  if (asInt > 0xffffffff) return null;
  return [24, 16, 8, 0].map((shift) => (asInt >>> shift) & 0xff).join(".");
}

/**
 * Read the body of a Response up to MAX_RESPONSE_BYTES. Throws if the server
 * reports a non-HTML content-type (skips wasted work on PDFs, images, etc.)
 * or if the body exceeds the byte limit (prevents OOM on huge pages).
 */
async function readHtmlBody(response: Response, sourceUrl: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  const isHtmlLike = contentType.includes("text/html") || contentType.includes("application/xhtml");
  // Accept an empty/absent content-type — some servers omit it for HTML.
  // Reject clearly non-HTML types (PDF, images, JS, JSON, etc.) early.
  if (contentType && !isHtmlLike) {
    const type = contentType.split(";")[0].trim();
    throw new CaptureError(
      `URL returned non-HTML content-type (${type}): ${sourceUrl}`,
      422,
      "not-web-page",
    );
  }

  // Check Content-Length before streaming so we can bail before reading anything.
  const clHeader = response.headers.get("content-length");
  if (clHeader) {
    const contentLength = parseInt(clHeader, 10);
    if (!isNaN(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new CaptureError(
        `Response body too large (${contentLength} bytes, ` +
          `limit ${MAX_RESPONSE_BYTES}): ${sourceUrl}`,
        422,
        "too-large",
      );
    }
  }

  // Stream the body and abort once we hit the byte limit.
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        // We have partial HTML — truncate and let Readability do its best.
        chunks.push(value.slice(0, value.byteLength - (totalBytes - MAX_RESPONSE_BYTES)));
        break;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(chunks.reduce((sum, c) => sum + c.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(combined);
}

// Labels for the two redirects we follow, in the order they happen. A third
// redirect is refused, so the chain can't wander towards a private host.
const REDIRECT_LABELS = ["Redirect", "Second redirect"];

function isHttp(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}

function fetchHop(url: string): Promise<Response> {
  return fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KnowledgeCompounder/0.1; +https://example.com)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
}

// Resolve a redirect's Location against the URL that sent it, refusing any
// target that is not http(s) or points at a private host (SSRF guard).
function redirectTarget(response: Response, from: string, label: string): string {
  const location = response.headers.get("location");
  if (!location) {
    throw new CaptureError(
      `${label} from ${from} had no Location header`,
      422,
      "cannot-open",
    );
  }
  let next: URL;
  try {
    next = new URL(location, from);
  } catch {
    throw new CaptureError(
      `${label} to invalid URL: ${location}`,
      422,
      "not-web-address",
    );
  }
  if (!isHttp(next)) {
    throw new CaptureError(
      `Redirect to non-HTTP(S) scheme blocked: ${next.protocol}`,
      422,
      "not-web-address",
    );
  }
  if (isPrivateHost(next.hostname)) {
    throw new CaptureError(
      `Redirect to private/internal address blocked: ${next.hostname}`,
      422,
      "private-address",
    );
  }
  return next.toString();
}

export async function extractFromUrl(url: string): Promise<ExtractedDoc> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new CaptureError(`Invalid URL: ${url}`, 422, "not-web-address");
  }
  if (!isHttp(parsed)) {
    throw new CaptureError(
      `Only http and https URLs are supported (got ${parsed.protocol}): ${url}`,
      422,
      "not-web-address",
    );
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new CaptureError(
      `Fetching private/internal addresses is not allowed: ${parsed.hostname}`,
      422,
      "private-address",
    );
  }
  // Follow redirects by hand so every hop passes the same SSRF checks.
  let target = url;
  for (let hop = 0; ; hop++) {
    const response = await fetchHop(target);
    if (response.status < 300 || response.status >= 400) {
      if (!response.ok) {
        // The site answered with an error: not the reader's to fix (502).
        throw new CaptureError(
          `Failed to fetch ${target} (${response.status})`,
          502,
          "cannot-open",
        );
      }
      const html = await readHtmlBody(response, target);
      return extractFromHtml(html, target);
    }
    if (hop === REDIRECT_LABELS.length) {
      throw new CaptureError(
        `Too many redirects fetching ${url}`,
        422,
        "cannot-open",
      );
    }
    await response.body?.cancel();
    target = redirectTarget(response, target, REDIRECT_LABELS[hop]);
  }
}

export function extractFromText(input: string): ExtractedDoc {
  const trimmed = input.trim().slice(0, MAX_CHARS);
  return {
    title: deriveTitle(trimmed),
    text: trimmed,
    excerpt: makeExcerpt(undefined, trimmed),
  };
}

function fallback(html: string): ExtractedDoc {
  // Strip tags as a last resort — Readability returned null. We still want to
  // capture the user's content rather than fail, even if it's noisy.
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARS);
  return {
    title: deriveTitle(text),
    text,
    excerpt: makeExcerpt(undefined, text),
  };
}

function deriveTitle(text: string): string {
  if (!text) return "Untitled";
  const firstLine = text.split("\n").find((line) => line.trim().length > 0);
  const candidate = (firstLine ?? text).trim();
  return candidate.slice(0, DERIVED_TITLE_MAX);
}

function makeExcerpt(excerpt: string | null | undefined, text: string): string {
  const source = (excerpt ?? text).trim();
  if (source.length <= 280) return source;
  return source.slice(0, 277) + "…";
}

export function looksLikeUrl(input: string): boolean {
  try {
    const u = new URL(input.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
