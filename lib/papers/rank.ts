import { STOP_WORDS } from "@/lib/stop-words";

/**
 * Per-person paper ranking with no model call. Each person's interests are a
 * list of weighted terms (words or short phrases); a paper's score is how
 * strongly its title and abstract match them, by BM25, the standard keyword
 * relevance formula (https://en.wikipedia.org/wiki/Okapi_BM25).
 *
 * Design: docs/paper-picks design doc, "Ranking (no model)".
 */

export interface ProfileTerm {
  term: string;
  weight: number; // -1..1
  // "written": the person's own words; "compiled": the model's reading of
  // them (with paraphrases); "feedback": learned from more/less/save clicks.
  source: "written" | "compiled" | "feedback";
}

const isOwn = (t: ProfileTerm) => t.source !== "feedback";

export interface IndexedPaper {
  arxivId: string;
  title: string;
  abstract: string;
  hfUpvotes: number | null;
}

export interface Ranked {
  arxivId: string;
  score: number;
  relevance: number;
  matched: string[]; // the person's terms this paper matched, as they wrote them
  strongest: string;
}

const K1 = 1.2;
const B = 0.75;
const MAX_PHRASE_WORDS = 3;
// relevance = raw / (raw + RELEVANCE_HALF): a raw score of 5 is relevance 0.5.
const RELEVANCE_HALF = 5;
const QUALITY_WEIGHT = 0.2;
// log(1 + 100) / log(101) = 1: about a day's top paper on Hugging Face.
const TOP_UPVOTES = 100;
export const MAX_FEEDBACK_TERMS = 60;
// A term found in more than this share of papers can't tell one reader's
// taste from another's. Words a person wrote are always kept; library and
// feedback terms over it are skipped. Only applied to pools big enough for a
// share to mean something.
const MAX_SHARED_DF = 0.1;
const MIN_POOL_FOR_DF_RULE = 50;
// "Why you got this" names only terms that did at least this share of the
// work of the strongest one.
const MIN_EXPLAINING_SHARE = 0.25;
const MIN_FEEDBACK_DF = 3;

// Words STOP_WORDS leaves in that say nothing about a research topic: short
// function words (short tokens such as "rl" or "3d" stay) and the filler of
// interest text ("I want papers about how...").
const EXTRA_STOP_WORDS = new Set([
  "a",
  "an",
  "as",
  "at",
  "be",
  "by",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "to",
  "we",
  "us",
  "our",
  "its",
  "can",
  "via",
  "i",
  "me",
  "my",
  "want",
  "like",
  "love",
  "interested",
  "how",
  "why",
  "paper",
  "papers",
  "work",
  "study",
  "new",
]);

function stem(word: string): string {
  // Plural "s" only: "agents" and "agent" match; "loss" and "bias" stay.
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word)) {
    return word.slice(0, -1);
  }
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP_WORDS.has(w) && !EXTRA_STOP_WORDS.has(w))
    .map(stem);
}

export function normalizeTerm(term: string): string {
  return tokenize(term).join(" ");
}

export interface PaperIndex {
  docs: Map<
    string,
    { counts: Map<string, number>; length: number; upvotes: number }
  >;
  df: Map<string, number>;
  avgLength: number;
}

/** Count every 1- to 3-word phrase in each paper, once per pool. */
export function buildIndex(papers: IndexedPaper[]): PaperIndex {
  const docs: PaperIndex["docs"] = new Map();
  const df = new Map<string, number>();
  let totalLength = 0;
  for (const p of papers) {
    const tokens = tokenize(`${p.title} ${p.abstract}`);
    const counts = new Map<string, number>();
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 1; n <= MAX_PHRASE_WORDS && i + n <= tokens.length; n++) {
        const gram = tokens.slice(i, i + n).join(" ");
        counts.set(gram, (counts.get(gram) ?? 0) + 1);
      }
    }
    for (const gram of counts.keys()) df.set(gram, (df.get(gram) ?? 0) + 1);
    docs.set(p.arxivId, {
      counts,
      length: tokens.length,
      upvotes: p.hfUpvotes ?? 0,
    });
    totalLength += tokens.length;
  }
  return { docs, df, avgLength: papers.length ? totalLength / papers.length : 0 };
}

function bm25(index: PaperIndex, arxivId: string, gram: string): number {
  const doc = index.docs.get(arxivId);
  const tf = doc?.counts.get(gram) ?? 0;
  if (!doc || tf === 0) return 0;
  const n = index.docs.size;
  const df = index.df.get(gram) ?? 0;
  const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
  const norm = 1 - B + (B * doc.length) / (index.avgLength || 1);
  return (idf * tf * (K1 + 1)) / (tf + K1 * norm);
}

function quality(upvotes: number): number {
  return Math.min(1, Math.log(1 + upvotes) / Math.log(1 + TOP_UPVOTES));
}

/**
 * Score every paper in the index for one person, best first. Papers that
 * match a negative phrase the person wrote, or nothing at all, are left out;
 * any other negative (a model paraphrase, feedback) only lowers the sum.
 */
export function rankPapers(index: PaperIndex, terms: ProfileTerm[]): Ranked[] {
  const n = index.docs.size;
  const tooCommon = (gram: string) =>
    n >= MIN_POOL_FOR_DF_RULE && (index.df.get(gram) ?? 0) / n > MAX_SHARED_DF;
  const grams = terms
    .map((t) => ({ ...t, gram: normalizeTerm(t.term) }))
    .filter((t) => t.gram && (t.source === "written" || !tooCommon(t.gram)));
  const ranked: Ranked[] = [];
  for (const [arxivId, doc] of index.docs) {
    let raw = 0;
    let excluded = false;
    const hits: { term: string; contribution: number }[] = [];
    for (const t of grams) {
      const match = bm25(index, arxivId, t.gram);
      if (match === 0) continue;
      if (t.source === "written" && t.weight < 0) excluded = true;
      raw += t.weight * match;
      if (t.weight > 0) hits.push({ term: t.term, contribution: t.weight * match });
    }
    if (excluded || raw <= 0 || hits.length === 0) continue;
    const relevance = raw / (raw + RELEVANCE_HALF);
    const strongest = hits.reduce((a, b) =>
      b.contribution > a.contribution ? b : a,
    );
    ranked.push({
      arxivId,
      relevance,
      score: relevance * (1 + QUALITY_WEIGHT * quality(doc.upvotes)),
      matched: hits
        .filter(
          (h) => h.contribution >= MIN_EXPLAINING_SHARE * strongest.contribution,
        )
        .map((h) => h.term),
      strongest: strongest.term,
    });
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/** The top `n`, preferring picks led by different terms. */
export function pickDaily(ranked: Ranked[], n: number): Ranked[] {
  const picks: Ranked[] = [];
  const leads = new Set<string>();
  for (const r of ranked) {
    if (picks.length === n) break;
    if (leads.has(r.strongest)) continue;
    picks.push(r);
    leads.add(r.strongest);
  }
  for (const r of ranked) {
    if (picks.length === n) break;
    if (!picks.includes(r)) picks.push(r);
  }
  return picks.sort((a, b) => b.score - a.score);
}

/**
 * The `k` phrases that most set this paper apart, among phrases at least
 * MIN_FEEDBACK_DF papers share (so not one-off names or numbers) and that
 * are not already the person's own terms.
 */
export function feedbackTerms(
  index: PaperIndex,
  arxivId: string,
  terms: ProfileTerm[],
  k: number,
): string[] {
  const doc = index.docs.get(arxivId);
  if (!doc) return [];
  const ownGrams = new Set(terms.filter(isOwn).map((t) => normalizeTerm(t.term)));
  return [...doc.counts.keys()]
    .filter((g) => (index.df.get(g) ?? 0) >= MIN_FEEDBACK_DF && !ownGrams.has(g))
    .map((g) => ({ g, s: bm25(index, arxivId, g) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.g);
}

const clamp = (w: number) => Math.max(-1, Math.min(1, w));

/**
 * Nudge feedback terms by `delta` (+0.3 for "more" or "save", -0.3 for
 * "less"). The person's own terms never change; at most MAX_FEEDBACK_TERMS
 * feedback terms are kept, the oldest dropped first.
 */
export function applyFeedback(
  terms: ProfileTerm[],
  grams: string[],
  delta: number,
): ProfileTerm[] {
  const next = terms.map((t) => ({ ...t }));
  const key = (t: ProfileTerm) => normalizeTerm(t.term);
  for (const gram of grams) {
    const g = normalizeTerm(gram);
    const found = next.find((t) => key(t) === g);
    if (found && isOwn(found)) continue;
    if (found) found.weight = clamp(Math.round((found.weight + delta) * 10) / 10);
    else next.push({ term: g, weight: clamp(delta), source: "feedback" });
  }
  let feedback = next.filter((t) => !isOwn(t)).length;
  while (feedback > MAX_FEEDBACK_TERMS) {
    next.splice(
      next.findIndex((t) => !isOwn(t)),
      1,
    );
    feedback--;
  }
  return next;
}

const MAX_PHRASE_FOR_TERM = 4;
const NEGATION = /^(not|no|except|without|avoid)\s+/i;

/**
 * Turn interest text into terms without a model: the fallback when the
 * compile fails or is over its cap, and the first terms a new member gets.
 * Each comma-, semicolon- or line-separated piece is a phrase; "not X" (also
 * "no", "except", "without", "avoid") excludes X. A long piece is split into
 * its words at half weight, since a sentence is not a phrase.
 */
export function textTerms(text: string): ProfileTerm[] {
  const terms: ProfileTerm[] = [];
  const seen = new Set<string>();
  const add = (term: string, weight: number) => {
    const key = normalizeTerm(term);
    if (!key || seen.has(key)) return;
    seen.add(key);
    terms.push({ term, weight, source: "written" });
  };
  for (const piece of text.split(/[,;\n]+|\band\b|\bor\b/i)) {
    const trimmed = piece.trim();
    if (!trimmed) continue;
    const negative = NEGATION.test(trimmed);
    const phrase = trimmed.replace(NEGATION, "").trim();
    const words = tokenize(phrase);
    if (words.length === 0) continue;
    const isPhrase = phrase.split(/\s+/).length <= MAX_PHRASE_FOR_TERM;
    if (isPhrase) add(phrase, negative ? -1 : 1);
    else for (const w of words) add(w, negative ? -1 : 0.5);
  }
  return terms;
}
