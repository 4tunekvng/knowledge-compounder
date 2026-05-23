import Link from "next/link";
import { notFound } from "next/navigation";
import { renderMarkdown } from "@/lib/markdown";
import { getEssay, parseCitations } from "@/lib/services/queries";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function EssayPage({ params }: Params) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const essay = await getEssay(id);
  if (!essay) {
    notFound();
  }
  const html = renderMarkdown(essay.draftMd);
  const citations = parseCitations(essay.citations);

  return (
    <article className="flex flex-col gap-6">
      <header>
        <p className="text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
          Drafted essay
        </p>
        <h1
          className="font-serif text-4xl tracking-tight leading-tight"
          data-testid="essay-title"
        >
          {essay.title}
        </h1>
        <p className="text-sm text-[color:var(--muted)] mt-2">
          {new Date(essay.createdAt).toLocaleString()}
        </p>
      </header>

      <div
        className="prose-essay max-w-none"
        data-testid="essay-body"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      {citations.length > 0 && (
        <aside
          className="border-t border-[color:var(--border)] pt-6"
          data-testid="essay-citations"
        >
          <h2 className="font-serif text-lg mb-3">Citations</h2>
          <ul className="flex flex-col gap-2">
            {citations.map((c, i) => (
              <li
                key={i}
                className="text-sm border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-3"
              >
                <Link href={`/sources/${c.sourceId}`}>Source {c.sourceId}</Link>{" "}
                <span className="text-[color:var(--muted)]">— &ldquo;{c.quote}&rdquo;</span>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </article>
  );
}
