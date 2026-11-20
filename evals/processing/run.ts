// Runs the app's own processing step (lib/ai/process.ts) on every eval case
// against the real model, one call at a time, and saves each reply with its
// time. Pages are fetched once with the app's extractor and cached.
//
//   npx tsx --tsconfig evals/tsconfig.json evals/processing/run.ts <label> [ids...]
//
// Needs ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY in the environment.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { extractFromText, extractFromUrl } from "@/lib/extract/url";
import { processSource } from "@/lib/ai/process";
import { sanitizeForPrompt } from "@/lib/sanitize";

interface Case {
  id: string;
  kind: "link" | "text";
  input: string;
}

const dir = "evals/processing";
const cacheDir = join(dir, ".cache");
const [label, ...only] = process.argv.slice(2);
if (!label) throw new Error("usage: run.ts <label> [ids...]");
const cases: Case[] = JSON.parse(readFileSync(join(dir, "cases.json"), "utf8"));
const outDir = join(cacheDir, "runs", label);
mkdirSync(join(cacheDir, "inputs"), { recursive: true });
mkdirSync(outDir, { recursive: true });

async function inputOf(c: Case) {
  const file = join(cacheDir, "inputs", `${c.id}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const doc =
    c.kind === "link" ? await extractFromUrl(c.input) : extractFromText(c.input);
  writeFileSync(file, JSON.stringify(doc));
  return doc;
}

async function main() {
  for (const c of cases.filter((x) => only.length === 0 || only.includes(x.id))) {
    const doc = await inputOf(c);
    const started = Date.now();
    let result: unknown = null;
    let error: string | null = null;
    try {
      result = await processSource({
        title: sanitizeForPrompt(doc.title) || "Untitled",
        text: sanitizeForPrompt(doc.text),
      });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const ms = Date.now() - started;
    writeFileSync(
      join(outDir, `${c.id}.json`),
      JSON.stringify({ id: c.id, title: doc.title, ms, error, result }, null, 2),
    );
    console.log(`${c.id}: ${ms} ms ${error ? "ERROR " + error.slice(0, 120) : "ok"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
