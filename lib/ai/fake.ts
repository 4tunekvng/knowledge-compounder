import type {
  AdditionalCardsResult,
  EssayResult,
  ProcessingResult,
  ThemesResult,
} from "./schemas";

type FakeCard = ProcessingResult["cards"][number];

// Build a scaled, deterministic set of cards from the extracted concepts:
// one definition per concept plus a mechanism and an application card. Always
// yields between 4 and 6 cards (ProcessingResultSchema requires 4–12), so the
// "more flashcards" behaviour is visible even in the fake-AI E2E path.
function buildFakeCards(
  title: string,
  head: string,
  concepts: { name: string }[],
): FakeCard[] {
  const cards: FakeCard[] = concepts.slice(0, 4).map((c) => ({
    type: "definition" as const,
    front: `Define: ${c.name}`,
    back: `${c.name} — a central concept introduced in "${title}". ${head}`,
  }));
  cards.push({
    type: "mechanism",
    front: `How does ${concepts[1]?.name ?? "the mechanism"} work in "${title}"?`,
    back: `It works by ${concepts[2]?.name ?? "applying the framework"} to ${concepts[3]?.name ?? "the situation"}, producing the effect described in the source.`,
  });
  cards.push({
    type: "application",
    front: `When would you apply the idea from "${title}"?`,
    back: `Whenever you face the situation that ${concepts[0]?.name ?? "the concept"} maps onto — particularly when ${concepts[1]?.name ?? "the supporting condition"} is present.`,
  });
  return cards;
}

// Deterministic stand-ins for the AI calls. Activated when USE_FAKE_AI=1 (set
// by the Playwright config). Keeps E2E tests offline, cheap, and deterministic
// while still exercising the full app flow end-to-end.

export function fakeProcessing(title: string, text: string): ProcessingResult {
  const head = text.slice(0, 240).replace(/\s+/g, " ").trim();
  const wordCounts = countWords(text);
  const rawConcepts = wordCounts.slice(0, 4).map(([name], i) => ({
    name,
    weight: Number((1 / (i + 1)).toFixed(2)),
  }));
  // ProcessingResultSchema requires min(2) concepts; pad with title-derived
  // fallbacks when the text yields fewer (e.g. very short or numeric inputs).
  const concepts =
    rawConcepts.length >= 2
      ? rawConcepts
      : [
          { name: title.split(/\s+/)[0]?.toLowerCase() ?? "concept", weight: 1.0 },
          { name: "material", weight: 0.5 },
          ...rawConcepts,
        ].slice(0, 4);

  return {
    why_i_cared: `I'm collecting reading on ${title.toLowerCase()}. The opening — "${head}" — frames the problem I keep circling back to, and the rest builds the case I want to internalize before writing about it.`,
    key_takeaways: [
      `${title} centers on ${concepts[0]?.name ?? "a core idea"} as the load-bearing claim.`,
      `The argument depends on ${concepts[1]?.name ?? "a supporting mechanism"} more than the surface text suggests.`,
      `Most readers will miss the ${concepts[2]?.name ?? "subtle implication"} unless it is named explicitly.`,
    ],
    cards: buildFakeCards(title, head, concepts),
    concepts,
  };
}

// Deterministic stand-in for generateMoreCards(). Returns 3 new cards whose
// fronts are guaranteed not to collide with the ones already on the source.
export function fakeMoreCards(
  title: string,
  text: string,
  existingFronts: string[],
): AdditionalCardsResult {
  const head = text.slice(0, 200).replace(/\s+/g, " ").trim();
  const taken = new Set(existingFronts);
  const seed = countWords(text)
    .map(([w]) => w)
    .filter((w) => w.length > 3);
  const candidates: FakeCard[] = [
    {
      type: "definition",
      front: `Define (deeper): ${seed[0] ?? title}`,
      back: `A second-order reading of ${seed[0] ?? title} as developed in "${title}". ${head}`,
    },
    {
      type: "mechanism",
      front: `What breaks if ${seed[1] ?? "the core assumption"} fails in "${title}"?`,
      back: `The argument leans on ${seed[1] ?? "that assumption"}; remove it and the conclusion about ${seed[2] ?? "the outcome"} no longer follows.`,
    },
    {
      type: "application",
      front: `Give a concrete example of applying "${title}".`,
      back: `Apply it whenever ${seed[2] ?? "the relevant condition"} shows up — the source's reasoning transfers directly to that case.`,
    },
    {
      type: "application",
      front: `Where would the idea in "${title}" NOT apply?`,
      back: `It stops holding once ${seed[3] ?? "the supporting condition"} is absent, which is the boundary the source implies.`,
    },
  ];
  // Drop any whose front already exists; keep 2–8 (schema floor is 2).
  const fresh = candidates.filter((c) => !taken.has(c.front));
  return { cards: fresh.length >= 2 ? fresh : candidates };
}

export function fakeThemes(
  sources: { id: number; title: string; concepts: { name: string }[] }[],
): ThemesResult {
  if (sources.length < 2) {
    // This branch should not be reached in practice — generateThemes() guards against
    // calling findThemes/fakeThemes with fewer than 2 sources. Throwing is safer than
    // returning an object that violates ThemeSchema (source_ids requires min(2)) or
    // ThemesResultSchema (themes requires min(1)).
    throw new Error(
      "fakeThemes requires at least 2 sources (received " + sources.length + ")",
    );
  }

  const allConcepts = new Map<string, number[]>();
  for (const s of sources) {
    for (const c of s.concepts) {
      const key = c.name.toLowerCase();
      const existing = allConcepts.get(key) ?? [];
      existing.push(s.id);
      allConcepts.set(key, existing);
    }
  }

  const overlapping = Array.from(allConcepts.entries())
    .filter(([, ids]) => ids.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  if (overlapping.length === 0) {
    // Fall back to grouping all sources under a generic theme.
    return {
      themes: [
        {
          label: "Cross-cutting reading",
          summary:
            "These sources do not share an obvious concept yet, but they sit in adjacent territory. As more material is captured, sharper themes will emerge.",
          source_ids: sources.map((s) => s.id),
        },
      ],
    };
  }

  return {
    themes: overlapping.map(([concept, ids]) => ({
      label: `Recurring concept: ${concept}`,
      summary: `${ids.length} captured sources keep returning to "${concept}". This is a candidate thesis area worth synthesizing into a single argument before the thread fragments.`,
      source_ids: Array.from(new Set(ids)),
    })),
  };
}

export function fakeEssay(
  themeLabel: string,
  themeSummary: string,
  sources: { id: number; title: string; excerpt: string }[],
): EssayResult {
  const cited = sources.slice(0, Math.max(2, Math.min(4, sources.length)));
  const footnotes = cited
    .map((s, i) => `[^${i + 1}]: ${s.title} — "${s.excerpt}"`)
    .join("\n");
  const inline = cited.map((_, i) => `[^${i + 1}]`).join(" ");

  const draft = `# ${themeLabel}

${themeSummary}

## The argument

Across the captured material, the thread that keeps returning is ${themeLabel.toLowerCase()}. ${inline}

The strongest evidence sits in the opening paragraphs of each source: each author arrives at the same conclusion from a different starting point, and the convergence is what makes the pattern worth naming.

## What this means

If the pattern holds, the implication is direct: practitioners should stop treating these as separate concerns and start treating them as one. The downstream effects compound across decisions that look unrelated on the surface.

## Where this is weakest

- The connection between sources is suggestive, not yet rigorous. *(this is your weakest claim — do you have a personal example?)*
- A counter-argument exists, and the draft does not yet engage it.
- The framing is mine; the synthesis still needs a sharper thesis sentence.

## Footnotes

${footnotes}
`;

  return {
    title: `Notes toward a thesis on ${themeLabel.toLowerCase()}`,
    draft_md: draft,
    citations: cited.map((s) => ({
      source_id: s.id,
      quote: s.excerpt,
    })),
  };
}

function countWords(text: string): [string, number][] {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "have",
    "are",
    "was",
    "but",
    "not",
    "you",
    "your",
    "they",
    "their",
    "there",
    "what",
    "when",
    "which",
    "will",
    "into",
    "about",
    "than",
    "then",
    "been",
    "were",
    "also",
    "more",
    "most",
    "some",
    "such",
    "these",
    "those",
    "would",
    "could",
    "should",
    "make",
    "made",
    "much",
    "many",
    "very",
    "just",
    "only",
    "over",
    "after",
    "before",
    "between",
  ]);
  const counts = new Map<string, number>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || stop.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}
