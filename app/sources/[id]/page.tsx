import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getSourceDetail,
  parseTakeaways,
  parseConcepts,
} from "@/lib/services/queries";
import { RetrySourceButton } from "@/components/RetrySourceButton";
import { GenerateCardsButton } from "@/components/GenerateCardsButton";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export default async function SourcePage({ params }: Params) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const detail = await getSourceDetail(id);
  if (!detail) {
    notFound();
  }
  const { source, processing, cards, related } = detail;
  const takeaways = processing ? parseTakeaways(processing.keyTakeaways) : [];
  const concepts = processing ? parseConcepts(processing.concepts) : [];

  return (
    <article className="flex flex-col gap-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-[color:var(--muted)] mb-1">
          Source #{source.id}
        </p>
        <h1 className="font-serif text-3xl tracking-tight" data-testid="source-title">
          {source.title}
        </h1>
        {source.url && (
          <p className="mt-2 text-sm">
            <a href={source.url} target="_blank" rel="noopener noreferrer">
              {source.url}
            </a>
          </p>
        )}
      </header>

      {source.status === "failed" ? (
        <div
          className="border border-red-300 bg-red-50 rounded-md p-4 text-sm text-red-800"
          data-testid="source-error"
        >
          <p className="font-medium mb-1">Processing failed</p>
          <p>{source.errorMessage ?? "Unknown error."}</p>
          <RetrySourceButton sourceId={source.id} />
        </div>
      ) : source.status === "pending" ? (
        <div className="border border-amber-300 bg-amber-50 rounded-md p-4 text-sm text-amber-800">
          Still processing…
        </div>
      ) : null}

      {processing && (
        <>
          <section data-testid="why-i-cared">
            <h2 className="font-serif text-xl mb-2">Why I cared</h2>
            <p className="font-serif text-lg leading-relaxed text-[color:var(--foreground)]">
              {processing.whyICared}
            </p>
          </section>

          {takeaways.length > 0 && (
            <section data-testid="takeaways">
              <h2 className="font-serif text-xl mb-2">Key takeaways</h2>
              <ul className="list-disc ml-5 space-y-1.5 text-[color:var(--foreground)]">
                {takeaways.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </section>
          )}

          {concepts.length > 0 && (
            <section>
              <h2 className="font-serif text-xl mb-2">Concepts</h2>
              <div className="flex flex-wrap gap-2">
                {concepts.map((c) => (
                  <span
                    key={c.name}
                    className="text-sm border border-[color:var(--border)] rounded-full px-3 py-1 bg-[color:var(--card)]"
                    title={`weight: ${c.weight}`}
                  >
                    {c.name}
                    <span className="text-[color:var(--muted)] ml-2 text-xs">
                      {c.weight.toFixed(2)}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {source.status === "processed" && (
        <section data-testid="cards-section">
          <div className="flex items-center justify-between mb-3 gap-4">
            <h2 className="font-serif text-xl">
              Flashcards{" "}
              <span className="text-[color:var(--muted)] text-base font-normal">
                ({cards.length})
              </span>
            </h2>
            <GenerateCardsButton sourceId={source.id} />
          </div>
          {cards.length > 0 ? (
            <>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {cards.map((card) => (
                  <li
                    key={card.id}
                    className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-4"
                    data-testid={`card-${card.id}`}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-[color:var(--accent)] mb-2">
                      {card.cardType}
                    </p>
                    <p className="font-medium text-sm mb-2">{card.front}</p>
                    <p className="text-sm text-[color:var(--muted)] leading-relaxed">
                      {card.back}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-[color:var(--muted)]">
                Cards are queued for spaced review.{" "}
                <Link href="/review">Review now →</Link>
              </p>
            </>
          ) : (
            <p className="text-sm text-[color:var(--muted)]">
              No cards yet. Use <strong>Generate more cards</strong> to create some.
            </p>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section data-testid="related-section">
          <h2 className="font-serif text-xl mb-3">Related captures</h2>
          <ul className="flex flex-col gap-2">
            {related.map(({ source: r, score }) => (
              <li
                key={r.id}
                className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-3"
              >
                <Link
                  href={`/sources/${r.id}`}
                  className="text-[color:var(--foreground)] no-underline font-medium hover:text-[color:var(--accent)]"
                >
                  {r.title}
                </Link>
                <span className="text-xs text-[color:var(--muted)] ml-2">
                  similarity {score.toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="border border-[color:var(--border)] rounded-md bg-[color:var(--card)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
          Raw captured content ({source.rawContent.length.toLocaleString()} chars)
        </summary>
        <pre className="px-4 pb-4 text-xs whitespace-pre-wrap font-mono text-[color:var(--muted)] max-h-[400px] overflow-auto">
          {source.rawContent}
        </pre>
      </details>
    </article>
  );
}
