import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, isFakeAi, MODELS } from "./client";
import { fakeEssay } from "./fake";
import { EssayResultSchema, type EssayResult } from "./schemas";

const SYSTEM = `You are the Knowledge Compounder essay drafter. You take a theme that emerged from a user's reading corpus and draft a publishable essay in their voice.

Rules:
- Draft 800-1600 words of polished Markdown. Real argument, real structure (intro, body sections with headings, conclusion).
- Every load-bearing claim is footnoted with [^1], [^2], etc. inline. The matching [^N]: footnotes go at the bottom.
- Citations must point to the source IDs provided. Do not invent IDs or facts that aren't supported by the captured material.
- Mark the 1-3 weakest claims explicitly with an italic parenthetical: *(this is your weakest claim — do you have a personal example?)*. The user expects to be told where to push back.
- Voice: first-person plural or singular as fits the argument. Direct, unhedged, opinionated. No "in conclusion", no "in this essay we will explore". Skip preambles.
- Title is a short noun phrase or argument fragment, not a sentence. Under 140 chars.

Output JSON matching the provided schema exactly. The draft_md field is the full essay.`;

export async function draftEssay(args: {
  themeLabel: string;
  themeSummary: string;
  sources: { id: number; title: string; excerpt: string; whyICared: string }[];
}): Promise<EssayResult> {
  if (isFakeAi()) {
    return fakeEssay(args.themeLabel, args.themeSummary, args.sources);
  }

  const client = getAnthropic();

  const response = await client.messages.parse({
    model: MODELS.essay,
    max_tokens: 12_000,
    thinking: { type: "adaptive" },
    output_config: {
      format: zodOutputFormat(EssayResultSchema),
      effort: "xhigh",
    },
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserMessage(args) }],
  });

  if (!response.parsed_output) {
    throw new Error(
      `Essay returned no parsed output (stop_reason=${response.stop_reason})`,
    );
  }
  return response.parsed_output;
}

function buildUserMessage(args: {
  themeLabel: string;
  themeSummary: string;
  sources: { id: number; title: string; excerpt: string; whyICared: string }[];
}): string {
  const lines = args.sources.map(
    (s) =>
      `- Source ${s.id}: "${s.title}"\n    excerpt: "${s.excerpt}"\n    user note: ${s.whyICared}`,
  );
  return `# Theme to draft from

Label: ${args.themeLabel}

Summary: ${args.themeSummary}

# Source material (${args.sources.length} captured items)

${lines.join("\n\n")}

Draft the essay per the system instructions.`;
}
