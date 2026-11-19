import Link from "next/link";
import { notFound } from "next/navigation";
import { essayBodyMarkdown, renderMarkdown } from "@/lib/markdown";
import {
  catalogNumber,
  displayTitle,
  essayHeading,
  formatDay,
} from "@/lib/format";
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
  const citations = parseCitations(essay.citations);
  const [theme, sources] = await Promise.all([
    essay.themeId ? getTheme(user.id, essay.themeId) : null,
    listSources(user.id, 200),
  ]);
  const heading = essayHeading(essay.title, theme?.label ?? null);
  const html = renderMarkdown(
    essayBodyMarkdown(essay.draftMd, [heading, essay.title]),
  );
  // Citation i is footnote i + 1 (lib/ai/schemas.ts): each note names its
  // capture once, then quotes it.
  const titleOf = (sourceId: number) =>
    sources.find((s) => s.source.id === sourceId)?.source.title ??
    "A capture no longer in the library";

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
          {heading}
        </h1>
        {html.includes("<em>") && (
          <p className="mt-4 text-ui text-ink-2">
            Notes marked{" "}
            <span className="rounded-box bg-accent-wash px-1 text-accent">
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
          <h2 className="section-title mb-2">Notes</h2>
          <ol>
            {citations.map((c, i) => (
              <li
                key={i}
                id={`fn-${i + 1}`}
                className={
                  "grid scroll-mt-8 grid-cols-[24px_minmax(0,1fr)] gap-x-2 " +
                  "border-t border-line py-3 text-meta"
                }
              >
                <span className="text-ink-3">{i + 1}</span>
                <span>
                  <Link
                    href={`/sources/${c.sourceId}`}
                    className="text-ink no-underline hover:text-accent"
                  >
                    {catalogNumber(c.sourceId)} ·{" "}
                    {displayTitle(titleOf(c.sourceId))}
                  </Link>
                  <span className="mt-1 block text-ink-2">
                    &ldquo;{c.quote}&rdquo;
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </article>
  );
}
