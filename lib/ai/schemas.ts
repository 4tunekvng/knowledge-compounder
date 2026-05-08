import { z } from "zod";

export const ConceptSchema = z.object({
  name: z.string().min(1).max(80),
  weight: z.number().min(0).max(1),
});

export const CardSchema = z.object({
  type: z.enum(["definition", "mechanism", "application"]),
  front: z.string().min(3).max(280),
  back: z.string().min(3).max(800),
});

export const ProcessingResultSchema = z.object({
  why_i_cared: z
    .string()
    .min(40)
    .max(900)
    .describe(
      "100-word first-person reflection on why this material is worth remembering, in the user's voice.",
    ),
  key_takeaways: z
    .array(z.string().min(5).max(200))
    .min(2)
    .max(5)
    .describe("Two to five distinct takeaways, each as a single sentence."),
  cards: z
    .array(CardSchema)
    .length(3)
    .describe(
      "Exactly three Anki-style cards: one definition, one mechanism, one application.",
    ),
  concepts: z
    .array(ConceptSchema)
    .min(2)
    .max(8)
    .describe(
      "Distinct concept tags with importance weights (0-1) summing roughly to 1.",
    ),
});
export type ProcessingResult = z.infer<typeof ProcessingResultSchema>;

export const ThemeSchema = z.object({
  label: z.string().min(3).max(80),
  summary: z
    .string()
    .min(40)
    .max(600)
    .describe(
      "Two to four sentences describing the theme and why it cuts across the captured sources.",
    ),
  source_ids: z
    .array(z.number().int().positive())
    .min(2)
    .describe("IDs of sources that contribute to this theme. At least two."),
});

export const ThemesResultSchema = z.object({
  themes: z.array(ThemeSchema).min(1).max(5),
});
export type ThemesResult = z.infer<typeof ThemesResultSchema>;

export const CitationSchema = z.object({
  source_id: z.number().int().positive(),
  quote: z
    .string()
    .min(8)
    .max(600)
    .describe("Verbatim or near-verbatim quote from the source supporting the claim."),
});

export const EssayResultSchema = z.object({
  title: z.string().min(5).max(140),
  draft_md: z
    .string()
    .min(400)
    .describe(
      "Full essay draft in Markdown. Use [^1], [^2] footnote markers inline; place the matching [^N]: footnotes at the bottom.",
    ),
  citations: z
    .array(CitationSchema)
    .min(2)
    .describe("Citations corresponding to the [^N] footnote markers in the draft."),
});
export type EssayResult = z.infer<typeof EssayResultSchema>;
