// JSON-shape parsers for fields stored as TEXT in SQLite. These exist as a
// separate module so they can be unit-tested without pulling in `server-only`
// modules (DB client, Anthropic SDK, etc.).

export function parseConcepts(json: string): { name: string; weight: number }[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (c) => typeof c?.name === "string" && typeof c?.weight === "number",
    );
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
