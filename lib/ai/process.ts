import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getAnthropic, isFakeAi, MODELS } from "./client";
import { fakeProcessing } from "./fake";
import { ProcessingResultSchema, type ProcessingResult } from "./schemas";

const SYSTEM = `You are the Knowledge Compounder processing agent. The user has captured a piece of reading material — an article, essay, paper excerpt, or note — and you turn it into:

1. A 100-word "Why I cared" reflection in the user's own voice (first-person, plain prose, no preamble, no bullet points). Treat it as the user thinking out loud about why this is worth remembering.
2. Two to five distinct one-sentence takeaways. Each takeaway should be specific and load-bearing — not a generic restatement.
3. A set of Anki-style flashcards covering the testable ideas in the source. Use three kinds — definition (what is the key concept?), mechanism (how does it work?), application (when would you reach for it?) — and include multiple of each when the material supports it. Generate between 4 and 12 cards, scaled to the source: a short note may only justify 4; a dense essay or PDF chapter should yield 8–12, each card covering a *distinct* idea. Front sides are short prompts; back sides give the answer in 1–3 sentences. Cards must be answerable from the source — do not invent facts, and do not pad with near-duplicate cards.
4. Two to eight concept tags, each with an importance weight between 0 and 1. Weights should roughly reflect how central the concept is.

Stay strictly grounded in the captured text. If the text is short or thin, generate fewer cards rather than embellish. Output JSON matching the provided schema exactly.`;

export async function processSource(args: {
  title: string;
  text: string;
}): Promise<ProcessingResult> {
  if (isFakeAi()) {
    return fakeProcessing(args.title, args.text);
  }

  const client = await getAnthropic();
  const userMessage = buildUserMessage(args.title, args.text);

  const response = await client.messages.parse({
    model: MODELS.process,
    max_tokens: 4_000,
    thinking: { type: "adaptive" },
    output_config: {
      format: zodOutputFormat(ProcessingResultSchema),
      effort: "medium",
    },
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userMessage }],
  });

  if (!response.parsed_output) {
    throw new Error(
      `Processing returned no parsed output (stop_reason=${response.stop_reason})`,
    );
  }
  return response.parsed_output;
}

function buildUserMessage(title: string, text: string): string {
  return `# Captured material

Title: ${title}

---

${text}

---

Generate the processing for this material per the system instructions.`;
}
