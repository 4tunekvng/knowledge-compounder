import type { EssayResult, ProcessingResult, ThemesResult } from "./schemas";

// Deterministic stand-ins for the AI calls. Activated when USE_FAKE_AI=1 (set
// by the Playwright config). Keeps E2E tests offline, cheap, and deterministic
// while still exercising the full app flow end-to-end.

export function fakeProcessing(title: string, text: string): ProcessingResult {
  const head = text.slice(0, 240).replace(/\s+/g, " ").trim();
  const wordCounts = countWords(text);
  const concepts = wordCounts.slice(0, 4).map(([name], i) => ({
    name,
    weight: Number((1 / (i + 1)).toFixed(2)),
  }));

  return {
    why_i_cared: `I'm collecting reading on ${title.toLowerCase()}. The opening — "${head}" — frames the problem I keep circling back to, and the rest builds the case I want to internalize before writing about it.`,
    key_takeaways: [
      `${title} centers on ${concepts[0]?.name ?? "a core idea"} as the load-bearing claim.`,
      `The argument depends on ${concepts[1]?.name ?? "a supporting mechanism"} more than the surface text suggests.`,
      `Most readers will miss the ${concepts[2]?.name ?? "subtle implication"} unless it is named explicitly.`,
    ],
    cards: [
      {
        type: "definition",
        front: `Define: ${concepts[0]?.name ?? title}`,
        back: `${concepts[0]?.name ?? title} — the central concept introduced in "${title}". ${head}`,
      },
      {
        type: "mechanism",
        front: `How does ${concepts[1]?.name ?? "the mechanism"} work in "${title}"?`,
        back: `It works by ${concepts[2]?.name ?? "applying the framework"} to ${concepts[3]?.name ?? "the situation"}, producing the effect described in the source.`,
      },
      {
        type: "application",
        front: `When would you apply the idea from "${title}"?`,
        back: `Whenever you face the situation that ${concepts[0]?.name ?? "the concept"} maps onto — particularly when ${concepts[1]?.name ?? "the supporting condition"} is present.`,
      },
    ],
    concepts,
  };
}

export function fakeThemes(
  sources: { id: number; title: string; concepts: { name: string }[] }[],
): ThemesResult {
  if (sources.length < 2) {
    return {
      themes: [
        {
          label: `Single-source theme: ${sources[0]?.title ?? "captured material"}`,
          summary:
            "Only one source is captured so far. Themes become more useful with several sources covering related ground.",
          source_ids: sources.map((s) => s.id),
        },
      ],
    };
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
