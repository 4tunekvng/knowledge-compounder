import Link from "next/link";
import { ThemesPanel } from "@/components/ThemesPanel";
import {
  getCorpusForThemes,
  listEssays,
  listThemes,
  parseSourceIds,
} from "@/lib/services/queries";

export const dynamic = "force-dynamic";

export default function ThemesPage() {
  const themes = listThemes();
  const corpus = getCorpusForThemes();
  const essays = listEssays();

  const themeViews = themes.map((t) => ({
    id: t.id,
    label: t.label,
    summary: t.summary,
    sourceIds: parseSourceIds(t.sourceIds),
  }));

  const sourceTitlesById: Record<number, string> = {};
  for (const c of corpus) {
    sourceTitlesById[c.id] = c.title;
  }

  return (
    <div className="flex flex-col gap-10">
      <section>
        <h1 className="font-serif text-3xl tracking-tight mb-2">Emergent themes</h1>
        <p className="text-[color:var(--muted)] mb-6 max-w-2xl">
          The agent reads across your processed corpus and surfaces patterns that recur in
          two or more sources. Pick one and draft an essay from it.
        </p>
        <ThemesPanel
          themes={themeViews}
          sourceTitlesById={sourceTitlesById}
          hasEnoughSources={corpus.length >= 2}
          sourceCount={corpus.length}
        />
      </section>

      {essays.length > 0 && (
        <section>
          <h2 className="font-serif text-xl mb-3">Drafted essays</h2>
          <ul className="flex flex-col gap-2" data-testid="essays-list">
            {essays.map((e) => (
              <li
                key={e.id}
                className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-4"
              >
                <Link
                  href={`/essays/${e.id}`}
                  className="font-serif text-lg text-[color:var(--foreground)] no-underline hover:text-[color:var(--accent)]"
                  data-testid={`essay-link-${e.id}`}
                >
                  {e.title}
                </Link>
                <p className="text-xs text-[color:var(--muted)] mt-1">
                  {new Date(e.createdAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
