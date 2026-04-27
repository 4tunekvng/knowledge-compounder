# Knowledge Compounder

A focused v0 of the [Knowledge Compounder PRD](./PRD.md): capture reading material, have Claude distill it into "Why I cared" notes + spaced-repetition cards + concept tags, surface emergent themes across the corpus, and draft footnoted essays from those themes.

## What's in this v0

- **Capture** — paste a URL (server extracts via Mozilla Readability) or raw text. Stored in SQLite.
- **Process** — for every capture, Claude (Sonnet 4.6, adaptive thinking, structured outputs) generates a 100-word reflection in your voice, key takeaways, three Anki-style flashcards (definition / mechanism / application), and tagged concepts.
- **Library** — browse all captures with their generated metadata.
- **Review** — SM-2 spaced repetition queue. Five-grade response (Blank / Hard / OK / Good / Easy) reschedules each card.
- **Cross-links** — every capture is embedded (Voyage AI when configured, deterministic lexical fallback otherwise). Source pages show related captures by cosine similarity.
- **Themes** — Claude reads across the processed corpus and surfaces patterns recurring in 2+ sources.
- **Essay drafter** — pick a theme; Claude (Opus 4.7, adaptive thinking, `effort: xhigh`) writes a footnoted Markdown draft, marks the weakest claims for the user to push back on.

## What's deliberately out of scope for v0

Per the PRD this is week-1-through-9 work, distilled to the demonstrable loop. Skipped: Kindle/Readwise/Zotero auto-ingest, browser extension, voice-tone learning from prior writing, podcast/PDF ingestion, multi-user auth, public deploy.

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
npm test          # vitest unit tests (32 tests)
npm run test:e2e  # playwright end-to-end loop (8 tests)
npm run typecheck # tsc --noEmit
npm run lint      # eslint
npm run build     # next build production smoke test
```

The E2E suite spins up a real dev server with `USE_FAKE_AI=1` and a dedicated SQLite file, then walks the full capture → review → themes → essay loop in a real browser.

## Architecture

```
app/                      Next.js App Router
  page.tsx                Capture form + recent captures
  library/                List of all sources
  sources/[id]/           Source detail with cards + cross-links
  review/                 SM-2 review queue
  themes/                 Themes panel + essays index
  essays/[id]/            Drafted essay viewer
  api/
    capture/              POST: ingest a URL or text
    review/               POST: grade a card
    themes/               POST: regenerate themes from current corpus
    essay/                POST: draft an essay from a theme
components/               Client components (CaptureForm, ReviewQueue, ThemesPanel, …)
lib/
  ai/                     Anthropic SDK calls (process, themes, essay) + fake stubs
  db/                     Drizzle schema + better-sqlite3 client
  embeddings/             Voyage REST client + lexical fallback + cosine similarity
  extract/                URL → readable text via @mozilla/readability + jsdom
  parsers.ts              Pure JSON parsers (DB stores arrays/objects as TEXT)
  services/               Orchestration: ingest, queries, themes, review
  sm2/                    SuperMemo-2 spaced repetition algorithm
  markdown.ts             Tiny dependency-free Markdown renderer
tests/
  unit/                   Vitest — pure functions only
  e2e/                    Playwright — real browser, real DB, fake AI
```

## Notes on AI usage

- `claude-sonnet-4-6` for per-source processing and theme clustering — balanced cost.
- `claude-opus-4-7` for essay drafting — the wow moment, paid for explicitly.
- All calls use **adaptive thinking** and **structured outputs** (`output_config.format` with Zod schemas via `messages.parse()`).
- System prompts are stable text blocks with `cache_control: ephemeral` so the prefix caches across requests.
- The `USE_FAKE_AI=1` flag swaps every AI call for a deterministic stub used by E2E tests — same shape, no network, no cost.
