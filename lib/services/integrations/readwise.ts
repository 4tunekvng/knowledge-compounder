/**
 * Readwise V2 export integration.
 *
 * API docs: https://readwise.io/api_deets
 *
 * The /api/v2/export/ endpoint returns books with nested highlights and is
 * the recommended way to incrementally sync. We pass `updatedAfter` to get
 * only highlights changed since the last sync, then page via `next_page_cursor`.
 *
 * Token: a single header — `Authorization: Token <token>`. Free Readwise
 * accounts can issue one at https://readwise.io/access_token.
 */

import {
  InvalidTokenError,
  type IngestSource,
  type NewCapture,
} from "../ingest-source";

const READWISE_EXPORT_URL = "https://readwise.io/api/v2/export/";
const PROVIDER = "readwise";

/** Minimal shape of the Readwise export response we care about. */
interface ReadwiseHighlight {
  id: number;
  text: string;
  note?: string | null;
  url?: string | null;
  highlighted_at?: string | null;
  updated_at?: string | null;
}

interface ReadwiseBook {
  user_book_id: number;
  title: string;
  source_url?: string | null;
  highlights: ReadwiseHighlight[];
}

interface ReadwiseExportResponse {
  count: number;
  next_page_cursor: string | null;
  results: ReadwiseBook[];
}

export class ReadwiseSource implements IngestSource {
  readonly provider = PROVIDER;

  constructor(
    /** Override for tests. Defaults to the real fetch. */
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async *fetchNew(
    token: string,
    sinceCursor?: Date,
  ): AsyncGenerator<NewCapture> {
    let pageCursor: string | null = null;
    let firstPage = true;

    while (firstPage || pageCursor) {
      firstPage = false;
      const url = buildExportUrl(sinceCursor, pageCursor);
      const data = await this.fetchPage(url, token);
      for (const book of data.results) {
        for (const h of book.highlights) {
          yield highlightToCapture(book, h);
        }
      }
      pageCursor = data.next_page_cursor;
    }
  }

  /**
   * One page fetch with 401 → InvalidTokenError, single retry on 429.
   * Other non-2xx responses throw a generic error so the orchestrator can
   * record it as a per-item failure and keep going.
   */
  private async fetchPage(
    url: string,
    token: string,
    retried = false,
  ): Promise<ReadwiseExportResponse> {
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: { Authorization: `Token ${token}` },
    });
    if (res.status === 401) {
      throw new InvalidTokenError(PROVIDER);
    }
    if (res.status === 429 && !retried) {
      // Respect Retry-After. Spec allows seconds or HTTP-date; we only honor
      // seconds (Readwise sends seconds). Cap at 60s so a misconfigured
      // server can't stall the entire sync.
      const ra = res.headers.get("Retry-After");
      const seconds = Math.min(60, Math.max(1, Number(ra) || 1));
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return this.fetchPage(url, token, true);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Readwise export failed: HTTP ${res.status} ${res.statusText}. Body: ${body.slice(0, 200)}`,
      );
    }
    return (await res.json()) as ReadwiseExportResponse;
  }
}

/**
 * Build the export URL with optional updatedAfter (ISO 8601) and pageCursor.
 * Exported for unit tests — easier than asserting fetch arguments.
 */
export function buildExportUrl(
  sinceCursor?: Date,
  pageCursor?: string | null,
): string {
  const u = new URL(READWISE_EXPORT_URL);
  if (sinceCursor) {
    u.searchParams.set("updatedAfter", sinceCursor.toISOString());
  }
  if (pageCursor) {
    u.searchParams.set("pageCursor", pageCursor);
  }
  return u.toString();
}

/**
 * Map a Readwise (book, highlight) pair to a NewCapture. The body is the
 * highlight text plus the user's note (if any), separated by a blank line.
 * URL falls back from highlight.url to book.source_url.
 */
export function highlightToCapture(
  book: ReadwiseBook,
  h: ReadwiseHighlight,
): NewCapture {
  const text = h.note
    ? `${h.text}\n\nNote: ${h.note}`
    : h.text;
  const updatedAtIso = h.updated_at ?? h.highlighted_at ?? null;
  return {
    externalId: String(h.id),
    title: book.title,
    text,
    url: h.url ?? book.source_url ?? undefined,
    externalUpdatedAt: updatedAtIso ? new Date(updatedAtIso) : undefined,
  };
}
