import "server-only";
import { isFakeAi, MODELS, parseStructured } from "./client";
import { fakeThemes } from "./fake";
import { ThemesResultSchema, type ThemesResult } from "./schemas";
import { sanitizeForPrompt } from "@/lib/sanitize";

const SYSTEM = `You are the Knowledge Compounder themes agent. The user has captured a corpus of reading and you find emergent themes that cut across multiple sources.

Rules:
- A theme must connect at least two sources. Single-source observations are not themes.
- A theme is a recurring concept, claim, tension, or pattern — not a topic label.
- Surface 1-5 themes, ordered by how interesting and synthesizable they are.
- Theme labels are short noun phrases (under 80 chars). Summaries are 2-4 sentences explaining what the pattern is and why it is worth a thesis.
- Be specific. "Things about AI" is not a theme. "Distribution moats hold while data moats erode in the LLM era" is.
- Use the source IDs you are given — do not invent new IDs.

Output JSON matching the provided schema exactly.`;

export async function findThemes(
  sources: { id: number; title: string; concepts: { name: string }[]; whyICared: string }[],
): Promise<ThemesResult> {
  if (isFakeAi()) {
    return fakeThemes(sources);
  }

  return parseStructured({
    label: "Themes",
    model: MODELS.themes,
    maxTokens: 4096,
    effort: "medium",
    schema: ThemesResultSchema,
    system: SYSTEM,
    userMessage: buildUserMessage(sources),
  });
}


function buildUserMessage(
  sources: { id: number; title: string; concepts: { name: string }[]; whyICared: string }[],
): string {
  const lines = sources.map((s) => {
    const concepts = s.concepts.map((c) => sanitizeForPrompt(c.name)).join(", ");
    return `- Source ${s.id}: "${sanitizeForPrompt(s.title)}"\n    concepts: ${concepts || "(none)"}\n    note: ${sanitizeForPrompt(s.whyICared)}`;
  });
  return `# Captured corpus (${sources.length} sources)

${lines.join("\n\n")}

Find the emergent themes per the system instructions.`;
}
