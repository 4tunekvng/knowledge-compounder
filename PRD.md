# Knowledge Compounder

**One line:** A memory + synthesis OS for any reader/learner/writer — captures everything you read, generates spaced-repetition cards, surfaces emergent themes, and drafts essays from your own accumulated thinking.

**Status:** Product PRD, April 2026
**Category:** Personal-knowledge / "tools-for-thought" SaaS.

---

## The wow moment

You've been reading about competitive moats for two months. Twelve articles, three books, four podcast episodes. You haven't realized you have a thesis.

It's Saturday afternoon. Your phone buzzes with a Knowledge Compounder notification:

> *"You've highlighted 14 passages on competitive moats since March 2nd. Across these passages, three distinct ideas keep recurring: (1) network effects degrade in the LLM era, (2) data moats are mostly mythical, (3) the durable moats are distribution and brand. You don't have a public take on any of this — want me to draft an essay?"*

You tap *yes*.

**45 seconds later**, a draft sits in your inbox. 1,400 words, in *your* voice (Knowledge Compounder has been reading your old Slack messages and Twitter for tone). Every claim is footnoted to the highlight that produced it. Every claim links to the original source. The draft has structure, a real argument, and three places marked *"this is your weakest claim — do you have a personal example?"*

You spend two hours polishing — rewriting one section, adding the personal example the draft asked for, sharpening the title. You publish.

**Two hours from "I should write that essay someday" to "the essay exists and is published."** Not because the AI wrote it for you — but because the synthesis was already in your head, scattered across two months of reading, and Knowledge Compounder gathered it into the shape of an essay you could finish.

This compounds. Month 6: you have shipped 6 essays this way. Month 12: you have a *body of work*. Month 24: you've moved from "knowledge worker" to "publishing knowledge worker" — the career inflection nobody else made because they couldn't bear the cold-start cost of every essay.

That is the wow. Knowledge Compounder doesn't write for you. It removes the thing that's been killing your essays before they start: **the fact that the synthesis is scattered**.

---

## What it does

### Universal capture
- **Books**: Kindle highlights API (auto), paper books (snap a margin photo, OCR + parse).
- **Papers**: arxiv, Semantic Scholar, Zotero — or just drop the PDF.
- **Podcasts**: Snipd / Pocket Casts integration → transcripts + your timestamps.
- **Articles**: browser extension; one-click capture.
- **Conversations**: Slack threads, iMessage with consent, Twitter bookmarks, voice memos.
- **Your own writing**: PRs, design docs, journal entries, prior published pieces (to learn your voice).

Everything goes into one semantically-indexed corpus that is yours, exportable, and never trained on.

### Daily processing
For every captured item, the agent generates:
- A 100-word *Why I cared* in your voice.
- Three Anki cards (definition, mechanism, application). Land in your nightly review queue.
- Two follow-up rabbit holes ("you might also care about…").
- Cross-links to other items in your corpus that share concepts.

### Living "Top Mental Models for You"
- A doc that updates continuously based on what you cite, what you apply, and where your highlights cluster. Bounded to 10 entries; demotion is a feature.

### Weekly emergent themes
- Saturday afternoon clustering pass. Surfaces themes like *"you've highlighted 14 passages on X."* Optional offer: *want me to draft?*

### Essay drafter
- When you say *yes* — or initiate yourself — the agent assembles every relevant highlight, cross-link, and prior thought; drafts in your voice with footnotes; flags weak sections asking for personal examples.
- If you target a publishing cadence (e.g., 1 essay every 2 weeks), maintains a rolling pipeline of 6 drafts at varying stages.

### Domain-pick assistant
- For users facing a "where do I go deep" decision: tracks engagement signal across topic areas (highlight density, return visits, follow-up rabbit holes). Outputs a dashboard.

---

## The MVP (10 weeks)

### MVP scope = "Capture → process → spaced surface → emergent themes → first published essay drafted by agent"

By the end of MVP, a beta user can: connect their reading sources, have 30+ Anki cards retained, see a "Top Mental Models" doc that reflects their actual reading, and trigger an essay draft from accumulated highlights that they polish and publish in under 4 hours total.

### Week-by-week build
| Wk | Deliverable |
|---|---|
| 1 | Readwise + Kindle + Zotero ingest → markdown corpus. |
| 2 | Daily 5pm digest: new captures + 100-word "why I cared" notes. |
| 3 | Anki card generation + AnkiConnect + Sunday approval queue. |
| 4 | Vector DB + cross-link retrieval. |
| 5 | "Top Mental Models" living doc + monthly update logic. |
| 6 | Browser extension (one-click article capture). |
| 7 | Voice-tone learning: ingest user's prior writing, fit a style profile. |
| 8 | Weekly emergent-themes clustering + Saturday notification. |
| 9 | Essay drafter: theme → outline → footnoted draft in user's voice. |
| 10 | Closed beta: 30 readers; first essay published from accumulated highlights. |

### Costs
- 10 weeks build (1 person).
- ~$200 Claude API spend during dev.

---

## Why this is structurally novel

Existing tools:
- **Readwise / Matter**: capture + passive resurfacing. Nothing acts on the data.
- **Anki**: spaced repetition that works, but card creation is the bottleneck.
- **Notion / Obsidian / Roam**: zettelkasten dreams that go to seed by month 3.
- **ChatGPT memory / Claude projects**: ephemeral; no spaced surfacing; no Anki; no synthesis pipeline.

Knowledge Compounder is **the first product that does the entire loop end-to-end** — capture, process, space, surface, synthesize, draft, publish — without you having to be disciplined about any individual step. The agent's job is to remove the cold-start cost between you and your next essay.

---

## How this serves Fortune's 3-year plan as a special case

Plan: 36 books, 12 skill-of-quarter Anki decks, ~750 papers, blog post #1 by Mar 2027, 6 posts in Y3 Q3, "what I know now" document by Y3 Q4. Without this product, all of that decays in scattered apps. With it, Y3 culminates in a teaching artifact that's already 80% drafted from accumulated highlights.

---

## Why this becomes a $500M+ company

- **TAM**: any reader of >1 book/month or >5 papers/month. Tens of millions globally.
- **Existing tools have ceilings**: Readwise hit ~$10M ARR with passive surfacing alone. The active synthesis layer is a 10–20× upgrade.
- **Network effect**: opt-in shared decks; top users become micro-creators.
- **Pricing**: $15–25/mo retail; $50/mo "publishing pipeline" tier; enterprise team license $100/seat.

---

## Risks
- **People won't act on synthesis prompts.** Mitigation: the agent does the cold-start, leaving only the polish — the part the user actually likes.
- **Synthesis quality.** Mitigation: footnoted to source; user's prior voice baked in; user always polishes.
- **Privacy.** Mitigation: per-user encryption, no model training on user content, full export.

## What success looks like
- Week 10: a demo where a beta user goes from "no thesis" to "published 1,400-word essay" in 4 hours of personal time.
- Year 1: 20K paid users, $4M ARR.
- Year 3: 500K paid users, $100M ARR. The default tool for the publishing knowledge worker.
