# Knowledge Compounder

A focused v0 of the [Knowledge Compounder PRD](./PRD.md): capture reading material, have Claude distill it into "Why I cared" notes + spaced-repetition cards + concept tags, surface emergent themes across the corpus, and draft footnoted essays from those themes.

## What's in this v0

- **Capture** — paste a URL (server extracts via Mozilla Readability), raw text, **or drop in a PDF** (text extracted server-side via [`unpdf`](https://github.com/unjs/unpdf), which runs in the Cloudflare Workers runtime). Stored in D1 (SQLite locally).
- **Process** — for every capture, Claude (Sonnet 4.6, adaptive thinking, structured outputs) generates a 100-word reflection in your voice, key takeaways, a **scaled set of Anki-style flashcards** (definition / mechanism / application — 4–12 cards depending on how much the source supports), and tagged concepts. A **Generate more cards** button on any source adds further distinct cards on demand.
- **Library** — browse all captures with their generated metadata.
- **Review** — FSRS-6 spaced-repetition queue. Four-grade response (Again / Hard / Good / Easy) reschedules each card.
- **Cross-links** — every capture is embedded (Voyage AI when configured, deterministic lexical fallback otherwise). Source pages show related captures by cosine similarity.
- **Themes** — Claude reads across the processed corpus and surfaces patterns recurring in 2+ sources.
- **Essay drafter** — pick a theme; Claude (Opus 4.8, adaptive thinking, `effort: xhigh`) writes a footnoted Markdown draft, marks the weakest claims for the user to push back on.
- **Shareable study decks** — bundle the flashcards from any sources into a deck and share **one public link** (`/d/<token>`, no login). Students study the cards in the browser (flip / shuffle / browse), or download them as a **printable PDF study guide** (`pdf-lib`) or an **Anki-importable CSV**. This is the "add PDFs + more flashcards → send it to students" loop.

## Auto-ingest

Connect your reading sources so highlights flow into the corpus automatically. Each new highlight gets the same Claude treatment as a manual capture: 100-word reflection, three flashcards, concept tags, cross-links.

**Shipped: Readwise.** Generate a token at https://readwise.io/access_token, then in the app go to `/integrations`, paste the token, click **Save token**, then **Sync now**. The orchestrator pages the Readwise V2 export endpoint, dedupes against `(source_type, external_id)`, and stores `lastSyncedAt` so the next run is incremental.

**Extending to more providers.** The integration lives behind an `IngestSource` interface (`lib/services/ingest-source.ts`):

```ts
interface IngestSource {
  readonly provider: string;
  fetchNew(token: string, sinceCursor?: Date): AsyncGenerator<NewCapture>;
}
```

Implement that interface, register it in `lib/services/ingest-orchestrator.ts#getSource()`, add the provider to the `source_type` enum in `lib/db/schema.ts`, and you're done — the orchestrator, dedup, sync UI, and AI pipeline reuse for free. Kindle (send-to-Kindle email parsing) and Zotero (Web API) are the next two.

Token storage is plaintext in the `integration_tokens` table — fine for single-user dev mode, **encrypt at rest before going multi-user**.

## What's deliberately out of scope for v0

Per the PRD this is week-1-through-9 work, distilled to the demonstrable loop. Skipped: Kindle/Zotero auto-ingest (the `IngestSource` interface is ready — implementations TBD), browser extension, voice-tone learning from prior writing, podcast ingestion, multi-user auth. (PDF ingestion and shareable decks now ship.)

## Run

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env.local
# Add ANTHROPIC_API_KEY=... to enable real AI processing.
# VOYAGE_API_KEY=... is optional (lexical fallback used otherwise).

# 3. Develop
npm run dev
# → http://localhost:3000
```

If `ANTHROPIC_API_KEY` is not set, capture/process will fail with a clear message. Set `USE_FAKE_AI=1` to use the deterministic stub responses (used by the E2E tests; useful for offline UI work).

## Test

```bash
npm test          # vitest unit tests (64 tests)
npm run test:e2e  # playwright end-to-end (10 tests)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run cf:build  # OpenNext → Cloudflare Workers build (production smoke test)
```

The E2E suite spins up a real dev server with `USE_FAKE_AI=1` and a dedicated SQLite file, then walks the full loop in a real browser: capture (text + **PDF upload**, parsed by unpdf) → generate-more-cards → review → themes → essay → **create a shareable deck, study it, and export it to PDF + Anki**.

## Architecture

```
app/                      Next.js App Router
  page.tsx                Capture form (URL / text / PDF) + recent captures
  library/                List of all sources
  sources/[id]/           Source detail with cards + cross-links + Generate-more-cards
  review/                 FSRS-6 review queue
  themes/                 Themes panel + essays index
  essays/[id]/            Drafted essay viewer
  decks/                  Create + manage shareable study decks
  d/[token]/              PUBLIC student study page (no login)
    pdf/                  GET: deck → printable PDF study guide (pdf-lib)
    anki/                 GET: deck → Anki-importable CSV
  api/
    capture/              POST: ingest a URL/text (JSON) or a PDF (multipart)
    sources/[id]/cards/   POST: generate additional flashcards for a source
    sources/[id]/retry/   POST: retry a failed source
    review/               POST: grade a card
    themes/               POST: regenerate themes from current corpus
    essay/                POST: draft an essay from a theme
    decks/                POST: create a deck · DELETE /[id]: remove one
    integrations/         Readwise token + sync endpoints
components/               Client components (CaptureForm, ReviewQueue, DeckManager,
                          StudyDeck, SiteHeader, GenerateCardsButton, …)
lib/
  ai/                     Anthropic SDK calls (process, more-cards, themes, essay) + fake stubs
  db/                     Drizzle schema + D1 (prod) / better-sqlite3 (dev) client
  embeddings/             Voyage REST client + lexical fallback + cosine similarity
  extract/                url.ts (Readability) + pdf.ts (unpdf, Workers-compatible)
  parsers.ts              Pure JSON parsers (DB stores arrays/objects as TEXT)
  services/
    ingest.ts             Manual + PDF + external capture pipeline
    cards.ts              Generate-more-cards for an existing source
    decks.ts              Create / list / fetch-by-token / delete decks
    ingest-source.ts      IngestSource interface + sanitizeForPrompt helper
    ingest-orchestrator.ts  Drives sync for one provider, dedupes via (source_type, external_id)
    integrations/         Per-provider IngestSource impls (readwise.ts; kindle/zotero TBD)
    queries.ts            Read-side: list/get for sources, cards, themes, essays
    themes.ts             Theme clustering + essay drafting
    review.ts             FSRS grading
  sm2/                    Spaced repetition (FSRS-6 implementation; module name kept for compatibility)
  markdown.ts             Tiny dependency-free Markdown renderer
tests/
  unit/                   Vitest — pure functions only
  e2e/                    Playwright — real browser, real DB, fake AI
```

## Deploy (Cloudflare Workers + D1)

```bash
npm run cf:build                                   # OpenNext build
CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler d1 migrations apply knowledge-compounder --remote
CLOUDFLARE_ACCOUNT_ID=<id> npm run cf:deploy       # deploy the worker
```

Production runs on Cloudflare D1 (real backend — nothing is stored in the
browser). Local dev / preview / e2e use a `DATABASE_PATH` SQLite file via the
better-sqlite3 adapter (`lib/db/local.ts`), dynamically imported so the native
module never enters the Workers bundle.

## Notes on AI usage

- `claude-sonnet-4-6` for per-source processing and theme clustering — balanced cost.
- `claude-opus-4-8` for essay drafting — the wow moment, paid for explicitly.
- All calls use **adaptive thinking** and **structured outputs** (`output_config.format` with Zod schemas via `messages.parse()`).
- System prompts are stable text blocks with `cache_control: ephemeral` so the prefix caches across requests.
- The `USE_FAKE_AI=1` flag swaps every AI call for a deterministic stub used by E2E tests — same shape, no network, no cost.
