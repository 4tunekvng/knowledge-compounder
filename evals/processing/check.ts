// The rubric checks code can decide, on one run's saved replies. The judged
// checks (rubric.md N2, N3, C2, C3) are scored by a separate reader.
//
//   npx tsx --tsconfig evals/tsconfig.json evals/processing/check.ts <label> [split]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Card { type: string; front: string; back: string }
interface Result {
  why_i_cared: string;
  key_takeaways: string[];
  cards: Card[];
  concepts: { name: string; weight: number }[];
}

const [label, splitName] = process.argv.slice(2);
const dir = join("evals/processing/.cache/runs", label);
const split = JSON.parse(readFileSync("evals/processing/split.json", "utf8"));
const keep: string[] | null = splitName ? split[splitName] : null;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

function checks(r: Result): Record<string, boolean> {
  const fronts = r.cards.map((c) => norm(c.front));
  const tags = r.concepts.map((c) => c.name);
  return {
    // N1: a note of about 100 words, prose, no list or heading marks.
    N1_note_shape:
      words(r.why_i_cared) >= 60 && words(r.why_i_cared) <= 130 &&
      !/^\s*([-*#]|\d+\.)/m.test(r.why_i_cared),
    // C1: 4 to 12 cards, no two with the same question.
    C1_card_count: r.cards.length >= 4 && r.cards.length <= 12 &&
      new Set(fronts).size === fronts.length,
    // C4: every answer short enough to recall: at most 40 words.
    C4_short_answers: r.cards.every((c) => words(c.back) <= 40),
    // T1: 2 to 8 tags, written as words a person reads (no snake_case,
    // camelCase or hashtags), none repeated.
    T1_tags: tags.length >= 2 && tags.length <= 8 &&
      tags.every((t) => !/[_#]|[a-z][A-Z]/.test(t)) &&
      new Set(tags.map(norm)).size === tags.length,
  };
}

let pass = 0;
let total = 0;
for (const file of readdirSync(dir).sort()) {
  const run = JSON.parse(readFileSync(join(dir, file), "utf8"));
  if (keep && !keep.includes(run.id)) continue;
  if (!run.result) {
    console.log(`${run.id}: FAILED RUN ${run.error}`);
    total += 4;
    continue;
  }
  const c = checks(run.result);
  const fails = Object.entries(c).filter(([, v]) => !v).map(([k]) => k);
  pass += Object.values(c).filter(Boolean).length;
  total += Object.keys(c).length;
  console.log(
    `${run.id} (${run.ms} ms): ${fails.length ? "fails " + fails.join(", ") : "all pass"}`,
  );
}
console.log(`code checks: ${pass}/${total}`);
