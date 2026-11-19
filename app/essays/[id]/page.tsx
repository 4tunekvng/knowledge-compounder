import Link from "next/link";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import { CatalogNo } from "@/components/CatalogNo";
import { displayTitle, essayHeading, formatDay } from "@/lib/format";
import {
  getEssay,
  getTheme,
  listSources,
  parseCitations,
} from "@/lib/services/queries";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function EssayPage({ params }: Params) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const essay = await getEssay(user.id, id);
  if (!essay) {
    notFound();
  }
  const html = renderMarkdown(essay.draftMd);
  const citations = parseCitations(essay.citations);
  const [theme, sources] = await Promise.all([
    essay.themeId ? getTheme(user.id, essay.themeId) : null,
    listSources(user.id, 200),
  ]);
  // The quotes are already the essay's footnotes; this lists each capture
  // the essay draws on once, linked, in the order first cited.
  const citedIds = [...new Set(citations.map((c) => c.sourceId))];
  const cited = citedIds.map((sourceId) => ({
    id: sourceId,
    title:
      sources.find((s) => s.source.id === sourceId)?.source.title ??
      "A capture no longer in the library",
  }));

  return (
    <article className="mx-auto flex max-w-[680px] flex-col gap-10">
      <header>
        <p className="text-meta text-ink-3">
          <Link href="/themes" className="text-ink-2">
            Themes
          </Link>
          {" · Essay draft · "}
          {formatDay(essay.createdAt)}
        </p>
        <h1
          className="mt-3 text-title font-medium"
          data-testid="essay-title"
        >
          {essayHeading(essay.title, theme?.label ?? null)}
        </h1>
        {html.includes("<em>") && (
          <p className="mt-4 text-ui text-ink-2">
            Notes marked{" "}
            <span className="rounded-sm bg-accent-wash px-1 text-accent">
              like this
            </span>{" "}
            follow the weakest claims: the places to push back or add your own
            example.
          </p>
        )}
      </header>

      <div
        className="prose-essay"
        data-testid="essay-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {citations.length > 0 && (
        <aside
          className="border-t border-line pt-8"
          data-testid="essay-citations"
        >
          <h2 className="section-title mb-2">Drawn from</h2>
          <ul>
            {cited.map((c) => (
              <li
                key={c.id}
                className="flex items-baseline gap-4 border-t border-line py-3"
              >
                <CatalogNo id={c.id} />
                <Link
                  href={`/sources/${c.id}`}
                  className={
                    "min-w-0 flex-1 text-ui text-ink no-underline " +
                    "hover:text-accent"
                  }
                >
                  {displayTitle(c.title)}
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  );
}
