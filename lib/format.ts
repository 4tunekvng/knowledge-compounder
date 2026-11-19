// Plain-words formatting shared by every screen: catalogue numbers, dates,
// where a capture came from, and how long until a card comes back.

import type { Source } from "@/lib/db/schema";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const monthFormat = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

// A title taken from pasted text is its first line, cut at this many
// characters (lib/extract/url.ts), so one this long may end mid-word.
export const DERIVED_TITLE_MAX = 120;

const LINK = /https?:\/\/\S+/g;
// A sentence ends at . ! or ? followed by a space, after a lowercase letter,
// a digit or a closing bracket or quote (so "U.S. law" is not two sentences).
const FIRST_SENTENCE = /^(.*?[a-z0-9)'"’”][.!?])\s/;

/**
 * Cut at the last whole word that fits in max characters, then add "…".
 * Used instead of CSS line clamping, which can cut a word in half.
 */
export function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const lastSpace = cut.lastIndexOf(" ");
  const kept = lastSpace > 0 ? cut.slice(0, lastSpace) : text.slice(0, max);
  return `${kept.replace(/[\s,;:.!?–—-]+$/, "")}…`;
}

/**
 * A capture's title as people should read it: links shown as their site,
 * the first sentence of pasted text, never a word cut in half.
 */
export function displayTitle(title: string, max = DERIVED_TITLE_MAX): string {
  let text = title.replace(LINK, (link) => hostOf(link)).replace(/\s+/g, " ");
  const sentence = FIRST_SENTENCE.exec(text);
  if (sentence) {
    text = sentence[1].replace(/\.$/, "");
  } else if (title.length >= DERIVED_TITLE_MAX) {
    // The stored title was cut mid-text: drop the last, maybe partial, word.
    const trimmed = title.endsWith(" ") ? text.trim() : text.replace(/\s*\S+$/, "");
    return `${trimmed.replace(/[\s,;:.!?–—-]+$/, "")}…`;
  }
  return cutAtWord(text.trim(), max);
}

/**
 * An essay's heading: "Draft: " and the theme it was written from, so the
 * list reads as titles; the drafter's own title when the theme is gone.
 */
export function essayHeading(title: string, themeLabel: string | null): string {
  return themeLabel ? `Draft: ${themeLabel}` : title;
}

/** "No. 11": how a capture is referred to everywhere, like a call number. */
export function catalogNumber(id: number): string {
  return `No. ${id}`;
}

/** "Application", "Definition": the kind of flashcard, as a label. */
export function cardTypeLabel(cardType: string): string {
  return cardType.charAt(0).toUpperCase() + cardType.slice(1);
}

/** "3 cards", "1 card". */
export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** "18 Nov 2026". */
export function formatDay(value: Date | number): string {
  return dayFormat.format(value);
}

/** "November 2026": the heading a capture is filed under in the library. */
export function formatMonth(value: Date | number): string {
  return monthFormat.format(value);
}

/** "worldmodels.github.io" from a full link; the link itself if it won't parse. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Where a capture came from, in a few words. */
export function originLabel(source: Pick<Source, "url" | "sourceType">): string {
  if (source.url) return hostOf(source.url);
  switch (source.sourceType) {
    case "pdf":
      return "PDF";
    case "readwise":
      return "Readwise highlight";
    case "zotero":
      return "Zotero";
    default:
      return "Pasted text";
  }
}

/** "in 10 minutes", "in 1 day", "in 3 months": when a graded card is due. */
export function formatInterval(ms: number): string {
  if (ms < HOUR_MS) {
    return `in ${countLabel(Math.max(1, Math.round(ms / MINUTE_MS)), "minute")}`;
  }
  if (ms < DAY_MS) return `in ${countLabel(Math.round(ms / HOUR_MS), "hour")}`;
  const days = Math.round(ms / DAY_MS);
  if (days < 31) return `in ${countLabel(days, "day")}`;
  if (days < 365) return `in ${countLabel(Math.round(days / 30), "month")}`;
  return `in ${countLabel(Math.round(days / 365), "year")}`;
}
