import Link from "next/link";
import { ThemesPanel } from "@/components/ThemesPanel";
import { formatDay } from "@/lib/format";
import {
  getCorpusForThemes,
  listEssays,
  listThemes,
  parseSourceIds,
} from "@/lib/services/queries";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const user = await requireUser();
  const themes = await listThemes(user.id);
  const corpus = await getCorpusForThemes(user.id);
  const essays = await listEssays(user.id);

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
    <div className="flex flex-col gap-16">
      <section>
        <h1 className="text-title font-medium">Themes</h1>
        <p className="mt-3 mb-8 max-w-[40rem] text-read text-ink-2">
          Ideas that come up in two or more of your captures, each filed with
          the captures it came from. Draft an essay from any of them.
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
          <h2 className="section-title mb-2">Drafted essays</h2>
          <ul data-testid="essays-list">
            {essays.map((e) => (
              <li
                key={e.id}
                className={
                  "flex flex-col gap-1 border-t border-line py-4 sm:flex-row " +
                  "sm:items-baseline sm:justify-between sm:gap-6"
                }
              >
                <Link
                  href={`/essays/${e.id}`}
                  className="text-read text-ink no-underline hover:text-accent"
                  data-testid={`essay-link-${e.id}`}
                >
                  {e.title}
                </Link>
                <span className="shrink-0 text-meta text-ink-3">
                  {formatDay(e.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
