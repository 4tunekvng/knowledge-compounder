import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { sources, themes, essays, processings } from "@/lib/db/schema";
import { findThemes } from "@/lib/ai/themes";
import { draftEssay as draftEssayAi } from "@/lib/ai/essay";
import { getCorpusForThemes, getTheme, parseSourceIds } from "./queries";

export async function generateThemes() {
  const corpus = await getCorpusForThemes();
  if (corpus.length < 2) {
    throw new Error(
      "Need at least 2 processed sources to surface themes. Capture more material first.",
    );
  }

  const result = await findThemes(corpus);
  const validIds = new Set(corpus.map((c) => c.id));
  const validated = result.themes
    .map((t) => ({
      ...t,
      source_ids: t.source_ids.filter((id) => validIds.has(id)),
    }))
    .filter((t) => t.source_ids.length >= 2);

  if (validated.length === 0) {
    throw new Error(
      "AI returned themes that referenced no captured sources. Try again after capturing more material.",
    );
  }

  const db = await getDb();
  // D1 doesn't support multi-statement transactions, so we delete then insert
  // sequentially. A failure between the delete and the first insert would
  // leave the themes table empty until the next successful regeneration.
  await db.delete(themes).run();

  const inserted = [];
  for (const t of validated) {
    const rows = await db
      .insert(themes)
      .values({
        label: t.label,
        summary: t.summary,
        sourceIds: JSON.stringify(t.source_ids),
      })
      .returning()
      .all();
    if (!rows[0]) throw new Error(`INSERT for theme "${t.label}" returned no rows`);
    inserted.push(rows[0]);
  }

  return inserted;
}

export async function draftEssayForTheme(themeId: number) {
  const theme = await getTheme(themeId);
  if (!theme) {
    throw new Error("Theme not found.");
  }
  const ids = parseSourceIds(theme.sourceIds);
  if (ids.length < 2) {
    throw new Error("Theme has fewer than 2 valid source ids.");
  }

  const db = await getDb();
  const themeSources = await db
    .select({
      source: sources,
      processing: processings,
    })
    .from(sources)
    .innerJoin(processings, eq(processings.sourceId, sources.id))
    .where(inArray(sources.id, ids))
    .all();

  if (themeSources.length < 2) {
    throw new Error(
      "Theme references sources that no longer exist — regenerate themes.",
    );
  }

  const essay = await draftEssayAi({
    themeLabel: theme.label,
    themeSummary: theme.summary,
    sources: themeSources.map((ts) => ({
      id: ts.source.id,
      title: ts.source.title,
      excerpt: ts.source.excerpt,
      whyICared: ts.processing.whyICared,
    })),
  });

  const inserted = await db
    .insert(essays)
    .values({
      themeId,
      title: essay.title,
      draftMd: essay.draft_md,
      citations: JSON.stringify(essay.citations),
    })
    .returning()
    .all();

  if (!inserted[0]) throw new Error("INSERT for essay returned no rows");
  return inserted[0];
}
