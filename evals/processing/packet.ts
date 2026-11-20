// Builds the grading packet for one run: the start of each source and what
// the app made from it, for the separate reader who scores N2, N3, C2, C3.
//
//   npx tsx --tsconfig evals/tsconfig.json evals/processing/packet.ts <label> <out>
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [label, out] = process.argv.slice(2);
const root = "evals/processing";
const cases = JSON.parse(readFileSync(join(root, "cases.json"), "utf8"));
const kindOf = new Map(cases.map((c: { id: string; kind: string }) => [c.id, c.kind]));
const runs = join(root, ".cache/runs", label);
const packet = readdirSync(runs).sort().map((file) => {
  const run = JSON.parse(readFileSync(join(runs, file), "utf8"));
  const doc = JSON.parse(
    readFileSync(join(root, ".cache/inputs", `${run.id}.json`), "utf8"),
  );
  const r = run.result ?? {};
  return {
    id: run.id,
    kind: kindOf.get(run.id),
    source_title: doc.title,
    source_text_start: doc.text.slice(0, 2500),
    error: run.error,
    note: r.why_i_cared,
    cards: (r.cards ?? []).map((c: { front: string; back: string }) => ({
      q: c.front,
      a: c.back,
    })),
  };
});
writeFileSync(out, JSON.stringify(packet, null, 1));
console.log(`${packet.length} records -> ${out}`);
