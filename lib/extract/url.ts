import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

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
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h === "::1") return true;
  // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1) — recurse on the embedded IPv4 address.
  if (h.startsWith("::ffff:")) return isPrivateHost(h.slice(7));
  // Block all remaining IPv6 addresses (fc00::/7 ULA, fe80:: link-local, etc.)
  if (h.includes(":")) return true;
  // IPv4 patterns
  const parts = h.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
    const [a, b] = parts;
    if (a === 127) return true;         // 127.0.0.0/8 loopback
    if (a === 10) return true;          // 10.0.0.0/8 private
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / metadata
    if (a === 0) return true;           // 0.0.0.0/8
  }
  return false;
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
    throw new Error(`URL returned non-HTML content-type (${contentType.split(";")[0].trim()}): ${sourceUrl}`);
  }

  // Check Content-Length before streaming so we can bail before reading anything.
  const clHeader = response.headers.get("content-length");
  if (clHeader) {
    const contentLength = parseInt(clHeader, 10);
    if (!isNaN(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      await response.body?.cancel();
      throw new Error(`Response body too large (${contentLength} bytes, limit ${MAX_RESPONSE_BYTES}): ${sourceUrl}`);
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

export async function extractFromUrl(url: string): Promise<ExtractedDoc> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error(`Fetching private/internal addresses is not allowed: ${parsed.hostname}`);
  }
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KnowledgeCompounder/0.1; +https://example.com)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  // Follow redirects manually to block SSRF via open-redirect to private hosts.
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) throw new Error(`Redirect from ${url} had no Location header`);
    let redirectUrl: URL;
    try {
      redirectUrl = new URL(location, url);
    } catch {
      throw new Error(`Redirect to invalid URL: ${location}`);
    }
    if (redirectUrl.protocol !== "http:" && redirectUrl.protocol !== "https:") {
      throw new Error(`Redirect to non-HTTP(S) scheme blocked: ${redirectUrl.protocol}`);
    }
    if (isPrivateHost(redirectUrl.hostname)) {
      throw new Error(`Redirect to private/internal address blocked: ${redirectUrl.hostname}`);
    }
    const followed = await fetch(redirectUrl.toString(), {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KnowledgeCompounder/0.1; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    // Validate any second-hop redirect to prevent SSRF via chained open-redirects.
    if (followed.status >= 300 && followed.status < 400) {
      await followed.body?.cancel();
      const location2 = followed.headers.get("location");
      if (!location2) throw new Error(`Second redirect from ${redirectUrl} had no Location header`);
      let finalUrl: URL;
      try {
        finalUrl = new URL(location2, redirectUrl);
      } catch {
        throw new Error(`Second redirect to invalid URL: ${location2}`);
      }
      if (finalUrl.protocol !== "http:" && finalUrl.protocol !== "https:") {
        throw new Error(`Redirect to non-HTTP(S) scheme blocked: ${finalUrl.protocol}`);
      }
      if (isPrivateHost(finalUrl.hostname)) {
        throw new Error(`Redirect to private/internal address blocked: ${finalUrl.hostname}`);
      }
      const finalResp = await fetch(finalUrl.toString(), {
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; KnowledgeCompounder/0.1; +https://example.com)",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      // Block further redirect chains beyond the third hop to prevent SSRF via deep chains.
      if (finalResp.status >= 300 && finalResp.status < 400) {
        throw new Error(`Too many redirects fetching ${url}`);
      }
      if (!finalResp.ok) throw new Error(`Failed to fetch ${finalUrl} (${finalResp.status})`);
      const finalHtml = await readHtmlBody(finalResp, finalUrl.toString());
      return extractFromHtml(finalHtml, finalUrl.toString());
    }
    if (!followed.ok) throw new Error(`Failed to fetch ${redirectUrl} (${followed.status})`);
    const html = await readHtmlBody(followed, redirectUrl.toString());
    return extractFromHtml(html, redirectUrl.toString());
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  const html = await readHtmlBody(response, url);
  const extracted = extractFromHtml(html, url);
  return extracted;
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
  return candidate.slice(0, 120);
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
