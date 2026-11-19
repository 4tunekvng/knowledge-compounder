import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AdditionalCardsResultSchema,
  EssayResultSchema,
  ProcessingResultSchema,
  ThemesResultSchema,
} from "@/lib/ai/schemas";

// Every schema the model fills. The SDK sends the API only the limits
// structured outputs enforce; it moves the rest (string lengths, list counts
// other than minItems 0 or 1, number ranges) into the field description as a
// hint, and messages.parse then re-checks the reply with Zod and throws on any
// the model missed. So text fields get room, and counts and ranges the app
// needs are enforced after parsing (slice, clamp), not in the schema.
const MODEL_SCHEMAS = {
  ProcessingResultSchema,
  AdditionalCardsResultSchema,
  ThemesResultSchema,
  EssayResultSchema,
};
const MIN_PROSE_CAP = 1000;
const SAFE = Number.MAX_SAFE_INTEGER; // z.int() emits these bounds; harmless.

type Node = { [key: string]: unknown };

function hardLimits(n: Node): string[] {
  const out: string[] = [];
  const max = n.maxLength;
  if (n.type === "string" && typeof max === "number" && max < MIN_PROSE_CAP) {
    out.push(`maxLength ${max}`);
  }
  if (n.type === "string" && typeof n.minLength === "number" && n.minLength > 1) {
    out.push(`minLength ${n.minLength}`);
  }
  if (n.type === "array" && n.maxItems !== undefined) {
    out.push(`maxItems ${n.maxItems}`);
  }
  if (n.type === "array" && typeof n.minItems === "number" && n.minItems > 1) {
    out.push(`minItems ${n.minItems}`);
  }
  for (const key of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]) {
    const v = n[key];
    if (typeof v === "number" && Math.abs(v) < SAFE) out.push(`${key} ${v}`);
  }
  return out;
}

function offenders(node: unknown, path: string): string[] {
  if (typeof node !== "object" || node === null) return [];
  const own = hardLimits(node as Node).map((limit) => `${path} ${limit}`);
  const children = Object.entries(node).flatMap(([key, child]) =>
    offenders(child, `${path}.${key}`),
  );
  return [...own, ...children];
}

describe("model output schemas", () => {
  it("hold no limit the API leaves to a hint and Zod then enforces", () => {
    const found = Object.entries(MODEL_SCHEMAS).flatMap(([name, schema]) =>
      offenders(z.toJSONSchema(schema, { io: "input" }), name),
    );

    expect(found).toEqual([]);
  });
});

// Every enum and const the model must pick from, in document order.
function choices(node: unknown): string[] {
  if (typeof node !== "object" || node === null) return [];
  const n = node as Node;
  const own = [n.enum, n.const].filter((v) => v !== undefined);
  return [
    ...own.map((v) => JSON.stringify(v)),
    ...Object.values(n).flatMap(choices),
  ];
}

describe("model output schemas sent to the API", () => {
  // SDK 1.6.0 turned enum and const into a description hint, so the model
  // could write a value outside the list and messages.parse then threw.
  it("keep every enum and const as a constraint, not a hint", () => {
    const schemas = Object.values(MODEL_SCHEMAS);
    const declared = schemas.flatMap((s) => choices(z.toJSONSchema(s, { io: "input" })));

    const sent = schemas.flatMap((s) => choices(zodOutputFormat(s).schema));

    expect(declared.length).toBeGreaterThan(0);
    expect(sent.sort()).toEqual(declared.sort());
  });
});
