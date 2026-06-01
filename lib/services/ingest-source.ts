/**
 * Auto-ingest abstraction. The orchestrator drives this generator and feeds
 * each yielded NewCapture into the existing ingest pipeline (which handles
 * Claude processing, embeddings, card creation). New providers (Kindle,
 * Zotero, etc.) implement this interface — no changes to the orchestrator
 * or the pipeline are required.
 *
 * Why a generator: real providers paginate (Readwise returns ~100 highlights
 * per page; Zotero similar). A generator lets us start processing the first
 * page immediately and stops cleanly when the orchestrator hits a per-sync
 * cap or the user cancels.
 */

export interface NewCapture {
  /** Stable id from the provider. Used to dedupe re-syncs. */
  externalId: string;
  /** Display title (book/article title, not the highlight). */
  title: string;
  /**
   * Body text. For highlight-style providers, this is the highlight + any
   * user note. Sanitized by the caller before being passed to the LLM —
   * implementations should leave the original text intact.
   */
  text: string;
  /** Optional permalink (book source url, highlight url, etc.). */
  url?: string;
  /** Provider-reported last-modified time. Used to advance the sync cursor. */
  externalUpdatedAt?: Date;
}

export interface IngestSource {
  /** Stable provider key — matches `sources.source_type` and `integration_tokens.provider`. */
  readonly provider: string;
  /**
   * Yield every capture updated after `sinceCursor`. Implementations are
   * responsible for pagination; the orchestrator just iterates.
   *
   * Throws `InvalidTokenError` on 401, generic Error on other failures.
   */
  fetchNew(
    token: string,
    sinceCursor?: Date,
  ): AsyncGenerator<NewCapture>;
}

export class InvalidTokenError extends Error {
  constructor(provider: string) {
    super(`Invalid token for provider '${provider}'. Re-paste the token in /integrations.`);
    this.name = "InvalidTokenError";
  }
}

/**
 * Strip newlines and double-quotes from a caller-supplied string before
 * interpolating it into a Claude prompt. Defends against prompt-injection
 * where a malicious title/note/URL contains "\n\nIgnore previous
 * instructions…". Per Fortune's CLAUDE.md (global instructions), every
 * external string in an LLM prompt must pass through this.
 */
export function sanitizeForPrompt(s: string): string {
  return s.replace(/[\r\n"]/g, " ").trim();
}
