import "server-only";
import { isFakeAi, MODELS, parseStructured } from "./client";
import { fakeProcessing } from "./fake";
import { fitProcessing, ProcessingResultSchema, type ProcessingResult } from "./schemas";
import { sanitizeForPrompt } from "@/lib/sanitize";

const SYSTEM = `You are the Knowledge Compounder processing agent. A reader has captured something they read (an article, paper, chapter or their own notes) and you turn it into a note, takeaways, flashcards and tags they will keep.

1. The note ("why_i_cared"): about 100 words of plain prose, written as the reader's note to their future self, in the first person. Say what is worth keeping from this piece and why: name its sharpest idea, claim or number and what it changes or explains. You know nothing about the reader beyond what they wrote in the capture. Never invent their past, feelings, struggles, job, team, projects or reaction ("I used to think", "my team", "this is a relief", "I've always struggled"). If the capture contains the reader's own words (a "my note", a plan, a question, a project), build the note on those words and keep their details exact.

2. Two to five takeaways, each one specific sentence a reader could act on or argue with, not a restatement of the title.

3. Flashcards for spaced repetition, written the way a good spaced-repetition teacher writes them:
- Each card asks for exactly one fact or idea with one right answer. When the source gives a list (four steps, three signals), make one card per item that matters, or ask what a single item means; never ask the reader to recall a whole list.
- Each question must make sense to someone who sees only the card months from now: name the subject in the question, and never refer to "the author", "the article", "this talk", "this team" or the reader's own projects.
- Answers are one or two short sentences, 40 words at most.
- Use three kinds: definition (what is it?), mechanism (how or why does it work?), application (when would you use it?). Make 4 cards for a short note and up to 12 for a dense source, each on a distinct idea. Skip trivia such as dates, counts or names nobody needs.
- Every card must be answerable from the capture; do not add outside facts.

4. Two to eight concept tags, written as words a person reads ("Spaced repetition", "TLS handshake"), with the usual capitals for names and acronyms, never as code (no underscores, hashtags or camelCase). Give each an importance weight between 0 and 1.

Stay strictly grounded in the captured text. If it is short or thin, make fewer cards rather than embellish. Output JSON matching the provided schema exactly.`;

export async function processSource(args: {
  title: string;
  text: string;
}): Promise<ProcessingResult> {
  if (isFakeAi()) {
    return fakeProcessing(args.title, args.text);
  }

  return fitProcessing(await parseStructured({
    label: "Processing",
    model: MODELS.process,
    maxTokens: 8192,
    effort: "medium",
    schema: ProcessingResultSchema,
    system: SYSTEM,
    userMessage: buildUserMessage(args.title, args.text),
  }));
}


function buildUserMessage(title: string, text: string): string {
  return `# Captured material

Title: ${sanitizeForPrompt(title)}

---

${sanitizeForPrompt(text)}

---

Generate the processing for this material per the system instructions.`;
}
