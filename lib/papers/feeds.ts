import { DOMParser } from "linkedom";
import { safeExternalHref } from "@/lib/safe-href";

/**
 * Parsers for the two places new papers come from. Both return the same
 * shape so the harvest can store them in one table.
 *
 * - arXiv's daily RSS feed per category (https://rss.arxiv.org/rss/cs.LG):
 *   every paper announced that day. Replacements of old papers are skipped.
 * - Hugging Face's daily list (https://huggingface.co/api/daily_papers):
 *   20-40 papers a day picked by readers, with upvotes as a quality signal.
 */

export interface HarvestedPaper {
  arxivId: string;
  title: string;
  authors: string[];
  abstract: string;
  categories: string[];
  publishedAt: number;
  hfUpvotes: number | null;
  // Hugging Face's own one-line summary; shown on daily picks (no model call).
  hfSummary: string | null;
  githubUrl: string | null;
  source: "arxiv" | "hf";
}

const KEPT_ANNOUNCE_TYPES = new Set(["new", "cross"]);
const ARXIV_ID = /^\d{4}\.\d{4,5}$/;

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function child(item: Element, tag: string): Element | undefined {
  return item.getElementsByTagName(tag)[0];
}

export function parseArxivRss(xml: string): HarvestedPaper[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const papers: HarvestedPaper[] = [];
  for (const item of Array.from(doc.getElementsByTagName("item"))) {
    const announce = text(child(item, "arxiv:announce_type"));
    if (!KEPT_ANNOUNCE_TYPES.has(announce)) continue;
    const arxivId = text(child(item, "link")).split("/abs/")[1] ?? "";
    const title = text(child(item, "title"));
    if (!ARXIV_ID.test(arxivId) || !title) continue;
    const description = text(child(item, "description"));
    const abstract = description.replace(/^.*?Abstract:\s*/, "");
    const publishedAt = Date.parse(text(child(item, "pubDate")));
    papers.push({
      arxivId,
      title,
      authors: text(child(item, "dc:creator"))
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean),
      abstract,
      categories: Array.from(item.getElementsByTagName("category"), (c) =>
        text(c as Element),
      ),
      publishedAt: Number.isNaN(publishedAt) ? Date.now() : publishedAt,
      hfUpvotes: null,
      hfSummary: null,
      githubUrl: null,
      source: "arxiv",
    });
  }
  return papers;
}

interface HfEntry {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    authors?: { name?: string }[];
    publishedAt?: string;
    upvotes?: number;
    githubRepo?: string | null;
    ai_summary?: string;
  };
}

export function parseHfDaily(entries: unknown): HarvestedPaper[] {
  if (!Array.isArray(entries)) return [];
  const papers: HarvestedPaper[] = [];
  for (const entry of entries as (HfEntry | null)[]) {
    const p = entry?.paper;
    const arxivId = p?.id ?? "";
    const title = (p?.title ?? "").replace(/\s+/g, " ").trim();
    if (!ARXIV_ID.test(arxivId) || !title) continue;
    const publishedAt = Date.parse(p?.publishedAt ?? "");
    papers.push({
      arxivId,
      title,
      authors: (p?.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
      abstract: (p?.summary ?? "").replace(/\s+/g, " ").trim(),
      categories: [],
      publishedAt: Number.isNaN(publishedAt) ? Date.now() : publishedAt,
      hfUpvotes: typeof p?.upvotes === "number" ? p.upvotes : 0,
      hfSummary: p?.ai_summary?.trim() || null,
      githubUrl: safeExternalHref(p?.githubRepo),
      source: "hf",
    });
  }
  return papers;
}

/**
 * Records from arXiv's query API (https://export.arxiv.org/api/query?id_list=),
 * for papers no daily feed carried, such as ones read before the harvest began.
 */
export function parseArxivAtom(xml: string): HarvestedPaper[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const papers: HarvestedPaper[] = [];
  for (const entry of Array.from(doc.getElementsByTagName("entry"))) {
    const id =
      text(child(entry, "id")).split("/abs/")[1]?.replace(/v\d+$/, "") ?? "";
    const title = text(child(entry, "title"));
    if (!ARXIV_ID.test(id) || !title) continue;
    const published = Date.parse(text(child(entry, "published")));
    papers.push({
      arxivId: id,
      title,
      authors: Array.from(entry.getElementsByTagName("name"), (n) =>
        text(n as Element),
      ).filter(Boolean),
      abstract: text(child(entry, "summary")),
      categories: Array.from(
        entry.getElementsByTagName("category"),
        (c) => (c as Element).getAttribute("term") ?? "",
      ).filter(Boolean),
      publishedAt: Number.isNaN(published) ? Date.now() : published,
      hfUpvotes: null,
      hfSummary: null,
      githubUrl: null,
      source: "arxiv",
    });
  }
  return papers;
}

/** Join the same paper from several feeds into one row. */
export function mergeHarvested(found: HarvestedPaper[]): HarvestedPaper[] {
  const byId = new Map<string, HarvestedPaper>();
  for (const paper of found) {
    const seen = byId.get(paper.arxivId);
    if (!seen) {
      byId.set(paper.arxivId, { ...paper });
      continue;
    }
    const fromArxiv = seen.source === "arxiv" ? seen : paper;
    byId.set(paper.arxivId, {
      ...fromArxiv,
      categories: [...new Set([...seen.categories, ...paper.categories])],
      hfUpvotes: seen.hfUpvotes ?? paper.hfUpvotes,
      hfSummary: seen.hfSummary ?? paper.hfSummary,
      githubUrl: seen.githubUrl ?? paper.githubUrl,
    });
  }
  return [...byId.values()];
}
