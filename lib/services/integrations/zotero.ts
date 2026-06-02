/**
 * Zotero Web API v3 integration.
 *
 * Zotero API docs: https://www.zotero.org/support/dev/web_api/v3/basics
 *
 * Fetches all items in a user library updated since `sinceCursor`, paging
 * via start/limit offset. Items are sorted descending by dateModified so
 * we can stop early once we hit items older than the cursor.
 *
 * Token format: `{userID}:{apiKey}` — both are required.
 * The userID is the numeric ID shown in zotero.org/settings/keys.
 * The API key is generated at zotero.org/settings/keys/new (read-only is sufficient).
 *
 * Example: `1234567:abc123xyz456` (no spaces).
 */

import {
  InvalidTokenError,
  type IngestSource,
  type NewCapture,
} from "../ingest-source";

const BASE_URL = "https://api.zotero.org";
const PAGE_SIZE = 100;
const PROVIDER = "zotero";

interface ZoteroItemData {
  key: string;
  itemType: string;
  title?: string;
  abstractNote?: string;
  url?: string;
  dateModified?: string;
}

interface ZoteroItem {
  key: string;
  data: ZoteroItemData;
}

export class ZoteroSource implements IngestSource {
  readonly provider = PROVIDER;

  constructor(
    /** Override for tests. Defaults to the real fetch. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async *fetchNew(
    token: string,
    sinceCursor?: Date,
  ): AsyncGenerator<NewCapture> {
    const { userId, apiKey } = parseToken(token);
    let start = 0;

    while (true) {
      const url = buildItemsUrl(userId, start);
      const items = await this.fetchPage(url, apiKey);
      if (items.length === 0) break;

      for (const item of items) {
        // Skip attachment and note items — they have no standalone bibliographic content.
        if (item.data.itemType === "attachment" || item.data.itemType === "note") continue;
        if (!item.data.title?.trim()) continue;

        const modifiedAt = item.data.dateModified ? new Date(item.data.dateModified) : undefined;

        // Items are sorted descending by dateModified. Once we hit an item older
        // than sinceCursor, everything after it is also older — stop the page walk.
        if (sinceCursor && modifiedAt && modifiedAt <= sinceCursor) return;

        yield itemToCapture(item, modifiedAt);
      }

      if (items.length < PAGE_SIZE) break;
      start += PAGE_SIZE;
    }
  }

  private async fetchPage(url: string, apiKey: string): Promise<ZoteroItem[]> {
    const res = await this.fetchImpl(url, {
      headers: { "Zotero-API-Key": apiKey, "Zotero-API-Version": "3" },
    });
    if (res.status === 403) throw new InvalidTokenError(PROVIDER);
    if (res.status === 404) throw new InvalidTokenError(PROVIDER);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Zotero API error: HTTP ${res.status} ${res.statusText}. Body: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as ZoteroItem[];
  }
}

export function parseToken(token: string): { userId: string; apiKey: string } {
  const idx = token.indexOf(":");
  if (idx < 1) {
    throw new Error(
      'Zotero token must be in the format "{userID}:{apiKey}". ' +
        "Find your userID and create an API key at zotero.org/settings/keys.",
    );
  }
  return { userId: token.slice(0, idx), apiKey: token.slice(idx + 1) };
}

export function buildItemsUrl(userId: string, start: number): string {
  const u = new URL(`${BASE_URL}/users/${userId}/items`);
  u.searchParams.set("format", "json");
  u.searchParams.set("sort", "dateModified");
  u.searchParams.set("direction", "desc");
  u.searchParams.set("limit", String(PAGE_SIZE));
  u.searchParams.set("start", String(start));
  return u.toString();
}

function itemToCapture(item: ZoteroItem, modifiedAt: Date | undefined): NewCapture {
  const d = item.data;
  const text = d.abstractNote?.trim()
    ? `${d.abstractNote.trim()}`
    : "(No abstract available)";
  return {
    externalId: item.key,
    title: d.title?.trim() || item.key,
    text,
    url: d.url || undefined,
    externalUpdatedAt: modifiedAt,
  };
}
