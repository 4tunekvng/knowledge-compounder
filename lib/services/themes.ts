import "server-only";
import { eq, inArray, isNull, or } from "drizzle-orm";
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
  // Insert new themes first so a mid-run failure leaves the existing themes
  // intact rather than leaving an empty table. Delete old rows only after all
  // inserts succeed (D1 doesn't support multi-statement transactions).
  const oldRows = await db.select({ id: themes.id }).from(themes).all();
  const oldIds = oldRows.map((r) => r.id);

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

  if (oldIds.length > 0) {
    // Delete orphaned essays first. Two cases must be covered:
    // 1. Essays whose themeId is one of the old IDs (about to be deleted).
    // 2. Essays whose themeId is already NULL — these were orphaned by a
    //    previous regeneration cycle that set themeId=null via the FK's
    //    onDelete:"set null" before we could delete them here.
    // inArray alone misses case 2 because SQL IN(...) never matches NULL.
    await db
      .delete(essays)
      .where(or(inArray(essays.themeId, oldIds), isNull(essays.themeId)))
      .run();
    await db.delete(themes).where(inArray(themes.id, oldIds)).run();
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
