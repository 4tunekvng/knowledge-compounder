import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ExtractedDoc {
  title: string;
  text: string;
  excerpt: string;
}

const MAX_CHARS = 60_000;

export function extractFromHtml(html: string, url?: string): ExtractedDoc {
  const dom = new JSDOM(html, { url: url ?? "https://example.invalid/" });
  const reader = new Readability(dom.window.document);
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
 * IPv6 loopback (::1), and plain "localhost".
 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h === "::1") return true;
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
    const location = response.headers.get("location");
    if (!location) throw new Error(`Redirect from ${url} had no Location header`);
    let redirectUrl: URL;
    try {
      redirectUrl = new URL(location, url);
    } catch {
      throw new Error(`Redirect to invalid URL: ${location}`);
    }
    if (isPrivateHost(redirectUrl.hostname)) {
      throw new Error(`Redirect to private/internal address blocked: ${redirectUrl.hostname}`);
    }
    const followed = await fetch(redirectUrl.toString(), {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; KnowledgeCompounder/0.1; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!followed.ok) throw new Error(`Failed to fetch ${redirectUrl} (${followed.status})`);
    const html = await followed.text();
    return extractFromHtml(html, redirectUrl.toString());
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`);
  }
  const html = await response.text();
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
