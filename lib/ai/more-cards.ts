import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, isFakeAi, MODELS } from "./client";
import { fakeMoreCards } from "./fake";
import { AdditionalCardsResultSchema, type AdditionalCardsResult } from "./schemas";

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

  const client = await getAnthropic();

  const response = await client.messages.parse({
    model: MODELS.process,
    max_tokens: 4_000,
    thinking: { type: "adaptive" },
    output_config: {
      format: zodOutputFormat(AdditionalCardsResultSchema),
      effort: "medium",
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
      `More-cards returned no parsed output (stop_reason=${response.stop_reason})`,
    );
  }
  return response.parsed_output;
}

function buildUserMessage(args: {
  title: string;
  text: string;
  existingFronts: string[];
}): string {
  const existing = args.existingFronts.length
    ? args.existingFronts.map((f) => `- ${f}`).join("\n")
    : "(none yet)";
  return `# Source

Title: ${args.title}

---

${args.text}

---

# Cards the user already has (do NOT duplicate these)

${existing}

Generate additional distinct cards per the system instructions.`;
}
