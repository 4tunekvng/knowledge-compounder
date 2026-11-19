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
