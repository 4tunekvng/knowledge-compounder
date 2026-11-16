import { z } from "zod";

// Schemas the model fills. The SDK sends the API only the limits structured
// outputs enforce; list counts other than 0 or 1, number ranges and string
// lengths become a hint in the field description, and messages.parse then
// throws on any the model missed, failing the whole call. So these schemas
// hold only text room and shape; the counts and ranges the app needs are
// said in .describe() and applied after parsing by the fit* functions below.

export const ConceptSchema = z.object({
  name: z.string().min(1).max(1000),
  weight: z.number().describe("Importance from 0 to 1."),
});

export const CardSchema = z.object({
  type: z.enum(["definition", "mechanism", "application"]),
  front: z.string().min(1).max(1000),
  back: z.string().min(1).max(1200),
});

export const ProcessingResultSchema = z.object({
  why_i_cared: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "100-word first-person reflection on why this material is worth remembering, in the user's voice.",
    ),
  key_takeaways: z
    .array(z.string().min(1).max(1000))
    .describe("Two to five distinct takeaways, each as a single sentence."),
  cards: z
    .array(CardSchema)
    .describe(
      "Between 4 and 12 Anki-style cards, scaled to how much distinct, testable " +
        "material the source contains. Mix definition / mechanism / application " +
        "types; multiple of each is encouraged for a rich source.",
    ),
  concepts: z
    .array(ConceptSchema)
    .describe(
      "Distinct concept tags with importance weights (0-1) summing roughly to 1.",
    ),
});
export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;

// Output of the "generate more cards" action on a source. New cards must be
// distinct from the ones already attached to the source.
export const AdditionalCardsResultSchema = z.object({
  cards: z
    .array(CardSchema)
    .describe(
      "Two to eight NEW Anki-style cards that do not duplicate the existing cards.",
    ),
});
export type AdditionalCardsResult = z.infer<typeof AdditionalCardsResultSchema>;

export const ThemeSchema = z.object({
  label: z.string().min(1).max(1000),
  summary: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "Two to four sentences describing the theme and why it cuts across the captured sources.",
    ),
  source_ids: z
    .array(z.number().int())
    .describe("IDs of sources that contribute to this theme. At least two."),
});

export const ThemesResultSchema = z.object({
  themes: z.array(ThemeSchema).describe("One to five themes."),
});
export type ThemesResult = z.infer<typeof ThemesResultSchema>;

export const CitationSchema = z.object({
  source_id: z.number().int(),
  quote: z
    .string()
    .min(1)
    .max(4000)
    .describe("Verbatim or near-verbatim quote from the source supporting the claim."),
});

export const EssayResultSchema = z.object({
  title: z.string().min(1).max(1000),
  draft_md: z
    .string()
    .min(1)
    .describe(
      "Full essay draft in Markdown. Use [^1], [^2] footnote markers inline; place the matching [^N]: footnotes at the bottom.",
    ),
  citations: z
    .array(CitationSchema)
    .describe("Citations corresponding to the [^N] footnote markers in the draft."),
});
export type EssayResult = z.infer<typeof EssayResultSchema>;

// The app's limits, applied to a parsed reply: extra items are trimmed and a
// weight outside 0 to 1 is clamped, so a reply one item over is kept, not lost.

export function fitProcessing(result: ProcessingResult): ProcessingResult {
  return {
    ...result,
    key_takeaways: result.key_takeaways.slice(0, 5),
    cards: result.cards.slice(0, 12),
    concepts: result.concepts.slice(0, 8).map((c) => ({
      ...c,
      weight: Math.min(1, Math.max(0, c.weight)),
    })),
  };
}

export function fitMoreCards(result: AdditionalCardsResult): AdditionalCardsResult {
  return { cards: result.cards.slice(0, 8) };
}

export function fitThemes(result: ThemesResult): ThemesResult {
  return { themes: result.themes.slice(0, 5) };
}
