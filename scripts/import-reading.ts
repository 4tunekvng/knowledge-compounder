/**
 * Bring someone's existing paper reading into paper picks, and backfill
 * Hugging Face's daily lists for past days. Writes a SQL file; run it with
 *   npx wrangler d1 execute knowledge-compounder --remote -c wrangler.jsonc \
 *     --file <out.sql>
 *
 * Usage:
 *   node --import tsx scripts/import-reading.ts --owner <user id> \
 *     [--interests <file>] [--saved <file>...] [--read <file or folder>...] \
 *     [--backfill-hf <YYYY-MM-DD>..<YYYY-MM-DD>] --out <out.sql>
 *
 * --owner is the person's fortuneking-auth user.id (the owner_id their rows
 * carry). --saved and --read take Markdown files or folders; every arXiv link
 * in them counts. Needs network access to export.arxiv.org and huggingface.co.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  type HarvestedPaper,
  mergeHarvested,
  parseArxivAtom,
  parseHfDaily,
} from "../lib/papers/feeds";
import { arxivIdsIn, buildImportSql } from "../lib/papers/import";

function args(name: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === name && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

function textOf(target: string): string {
  if (!statSync(target).isDirectory()) return readFileSync(target, "utf8");
  return readdirSync(target)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readFileSync(path.join(target, f), "utf8"))
    .join("\n");
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function arxivRecords(ids: string[]): Promise<HarvestedPaper[]> {
  const out: HarvestedPaper[] = [];
  // arXiv asks for one request every 3 seconds.
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50).join(",");
    const url = `https://export.arxiv.org/api/query?id_list=${batch}&max_results=50`;
    out.push(...parseArxivAtom(await (await fetch(url)).text()));
    await pause(3000);
  }
  return out;
}

async function hfDays(range: string): Promise<HarvestedPaper[]> {
  const [from, to] = range.split("..");
  const out: HarvestedPaper[] = [];
  for (let d = Date.parse(from); d <= Date.parse(to); d += 86_400_000) {
    const day = new Date(d).toISOString().slice(0, 10);
    const res = await fetch(
      `https://huggingface.co/api/daily_papers?date=${day}&limit=100`,
    );
    const papers = parseHfDaily(await res.json());
    // Dated by the day Hugging Face listed them, which is when they surfaced.
    out.push(...papers.map((p) => ({ ...p, publishedAt: d })));
  }
  return out;
}

async function main() {
  const owner = args("--owner")[0] ?? "";
  const outFile = args("--out")[0];
  if (!owner || !outFile) {
    console.error("Usage: --owner <user id> --out <file.sql> (see the header)");
    process.exit(1);
  }
  const interests = args("--interests").map(textOf).join("\n");
  const saved = args("--saved").flatMap((f) => arxivIdsIn(textOf(f)));
  const read = args("--read")
    .flatMap((f) => arxivIdsIn(textOf(f)))
    .filter((id) => !saved.includes(id));
  const records = await arxivRecords([...new Set([...saved, ...read])]);
  const backfill = (await Promise.all(args("--backfill-hf").map(hfDays))).flat();
  const papers = mergeHarvested([...records, ...backfill]);
  writeFileSync(
    outFile,
    buildImportSql({
      ownerId: owner,
      interests,
      saved,
      read,
      papers,
      now: Date.now(),
    }),
  );
  console.log(
    `${outFile}: ${papers.length} papers, ${new Set(saved).size} saved, ` +
      `${new Set(read).size} read before, interests ${interests ? "set" : "not set"}`,
  );
}

void main();
