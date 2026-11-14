import "server-only";
import { isFakeAi, MODELS, parseStructured } from "./client";
import { fakeMoreCards } from "./fake";
import { AdditionalCardsResultSchema, type AdditionalCardsResult } from "./schemas";
import { sanitizeForPrompt } from "@/lib/sanitize";

const SYSTEM = `You are the Knowledge Compounder card generator. The user already has some flashcards for a source and wants MORE — additional Anki-style cards that deepen coverage without repeating what they already have.

Rules:
- Generate 2–8 NEW cards. Each must test a distinct idea NOT already covered by the existing cards listed below.
- Use the three card kinds: definition, mechanism, application. Prefer angles the existing cards missed (edge cases, second-order implications, contrasts, worked examples).
- Cards must be answerable from the source text — do not invent facts.
- Front sides are short prompts; back sides answer in 1–3 sentences.

Output JSON matching the provided schema exactly.`;

export async function generateMoreCards(args: {
  title: string;
  text: string;
  existingFronts: string[];
}): Promise<AdditionalCardsResult> {
  if (isFakeAi()) {
    return fakeMoreCards(args.title, args.text, args.existingFronts);
  }

  return parseStructured({
    label: "More-cards",
    model: MODELS.process,
    maxTokens: 4096,
    effort: "medium",
    schema: AdditionalCardsResultSchema,
    system: SYSTEM,
    userMessage: buildUserMessage(args),
  });
}


function buildUserMessage(args: {
  title: string;
  text: string;
  existingFronts: string[];
}): string {
  const existing = args.existingFronts.length
    ? args.existingFronts.map((f) => `- ${sanitizeForPrompt(f)}`).join("\n")
    : "(none yet)";
  return `# Source

Title: ${sanitizeForPrompt(args.title)}

---

${sanitizeForPrompt(args.text)}

---

# Cards the user already has (do NOT duplicate these)

${existing}

Generate additional distinct cards per the system instructions.`;
}
