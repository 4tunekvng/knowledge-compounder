// JSON-shape parsers for fields stored as TEXT in SQLite. These exist as a
// separate module so they can be unit-tested without pulling in `server-only`
// modules (DB client, Anthropic SDK, etc.).

/**
 * A concept tag as a reader sees it. Models sometimes write tags as code
 * ("connection_reuse", "#memory", "spacedRepetition"); stored tags keep
 * whatever came back, so every reader of them goes through here.
 */
export function readableTag(name: string): string {
  const trimmed = name.trim();
  const codeLike = /^#|_|[a-z][A-Z]/.test(trimmed);
  const spaced = trimmed
    .replace(/^#+/, "")
    .replace(/_+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  // A tag written as code is read as plain words; an all-lowercase tag starts
  // with a capital, like the others. Tags with their own capitals (acronyms,
  // names) are left as written.
  if (!codeLike && spaced !== spaced.toLowerCase()) return spaced;
  const words = spaced
    .split(" ")
    .map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function parseConcepts(json: string): { name: string; weight: number }[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed
      .filter((c) => typeof c?.name === "string" && typeof c?.weight === "number")
      .map((c) => ({ name: readableTag(c.name), weight: c.weight }))
      .filter((c) => {
        const key = c.name.toLowerCase();
        if (!c.name || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  } catch {
    return [];
  }
}

export function parseTakeaways(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t) => typeof t === "string");
  } catch {
    return [];
  }
}

export function parseSourceIds(json: string): number[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((n) => typeof n === "number" && Number.isInteger(n) && n > 0);
  } catch {
    return [];
  }
}

export function parseCitations(
  json: string,
): { sourceId: number; quote: string }[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((c) => ({
        sourceId: Number(c?.source_id ?? c?.sourceId),
        quote: String(c?.quote ?? ""),
      }))
      .filter(
        (c) =>
          Number.isInteger(c.sourceId) && c.sourceId > 0 && c.quote.length > 0,
      );
  } catch {
    return [];
  }
}
