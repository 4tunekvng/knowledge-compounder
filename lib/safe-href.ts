/**
 * Allow only http(s) URLs for externally sourced <a href> targets so
 * javascript:/data: links from upstream feeds or providers cannot render.
 */
export function safeExternalHref(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    // Malformed or relative URL — refuse rather than pass to <a href>.
  }
  return null;
}
