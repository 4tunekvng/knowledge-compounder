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

export async function extractFromUrl(url: string): Promise<ExtractedDoc> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; KnowledgeCompounder/0.1; +https://example.com)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
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
