import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AdditionalCardsResultSchema,
  EssayResultSchema,
  ProcessingResultSchema,
  ThemesResultSchema,
} from "@/lib/ai/schemas";

// Every schema the model fills. The SDK only passes a string's length limit
// to the model as a hint in the field's description; nothing makes the model
// keep to it. parseStructured then re-checks the reply with Zod, which throws
// on a field that runs long, and the whole source or essay fails. Prose
// fields therefore need room for a slightly wordy but correct reply.
const MODEL_SCHEMAS = {
  ProcessingResultSchema,
  AdditionalCardsResultSchema,
  ThemesResultSchema,
  EssayResultSchema,
};
const MIN_PROSE_CAP = 1000;

type Node = { type?: string; maxLength?: number; [key: string]: unknown };

function tightCaps(node: unknown, path: string): string[] {
  if (typeof node !== "object" || node === null) return [];
  const n = node as Node;
  const own =
    n.type === "string" && n.maxLength !== undefined && n.maxLength < MIN_PROSE_CAP
      ? [`${path} maxLength ${n.maxLength}`]
      : [];
  const children = Object.entries(n).flatMap(([key, child]) =>
    tightCaps(child, `${path}.${key}`),
  );
  return [...own, ...children];
}

describe("model output schemas", () => {
  it("leave every text field at least 1000 characters of room", () => {
    const offenders = Object.entries(MODEL_SCHEMAS).flatMap(([name, schema]) =>
      tightCaps(z.toJSONSchema(schema), name),
    );

    expect(offenders).toEqual([]);
  });
});
