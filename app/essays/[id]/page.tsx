import Link from "next/link";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import { catalogNumber, formatDay } from "@/lib/format";
import { getEssay, parseCitations } from "@/lib/services/queries";
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
          {essay.title}
        </h1>
        {html.includes("<em>") && (
          <p className="mt-4 text-ui text-ink-2">
            Claims marked{" "}
            <span className="rounded-sm bg-accent-wash px-1 text-accent">
              like this
            </span>{" "}
            are the weakest. They are the places to push back or add your own
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
          <h2 className="section-title mb-2">Sources quoted</h2>
          <ol>
            {citations.map((c, i) => (
              <li
                key={i}
                className={
                  "grid grid-cols-[64px_1fr] gap-x-4 border-t border-line py-4 " +
                  "text-ui first:border-t-0"
                }
              >
                <Link
                  href={`/sources/${c.sourceId}`}
                  className="font-typed text-meta text-ink-2"
                >
                  {catalogNumber(c.sourceId)}
                </Link>
                <span className="text-ink-2">&ldquo;{c.quote}&rdquo;</span>
              </li>
            ))}
          </ol>
        </aside>
      )}
    </article>
  );
}
