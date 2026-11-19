import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import {
  getSourceDetail,
  parseTakeaways,
  parseConcepts,
} from "@/lib/services/queries";
import { requireUser } from "@/lib/auth/user";
import { IndexCard } from "@/components/IndexCard";
import { RetrySourceButton } from "@/components/RetrySourceButton";
import { GenerateCardsButton } from "@/components/GenerateCardsButton";
import {
  cardTypeLabel,
  catalogNumber,
  displayTitle,
  formatDay,
  originLabel,
} from "@/lib/format";
import { failureReason } from "@/lib/error-copy";

export const dynamic = "force-dynamic";

// Titles taken from the first line of pasted text can run long; past this
// they drop to the smaller heading size so they don't fill the screen.
const LONG_TITLE = 80;

interface Params {
  params: Promise<{ id: string }>;
}

export default async function SourcePage({ params }: Params) {
  const user = await requireUser();
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }
  const detail = await getSourceDetail(user.id, id);
  if (!detail) {
    notFound();
  }
  const { source, processing, cards, related } = detail;
  const takeaways = processing ? parseTakeaways(processing.keyTakeaways) : [];
  const concepts = processing ? parseConcepts(processing.concepts) : [];
  const title = displayTitle(source.title);
  const hasNotes = processing !== null || source.status === "processed";

  // The text as captured, at the foot of the note column.
  const captured = (
    <details className="panel text-ui">
      <summary className="cursor-pointer px-6 py-4 text-ink-2">
        Captured text ({source.rawContent.length.toLocaleString("en-GB")}{" "}
        characters)
      </summary>
      <pre
        className={
          "max-h-[400px] overflow-auto whitespace-pre-wrap px-6 pb-6 font-serif " +
          "text-meta text-ink-2"
        }
      >
        {source.rawContent}
      </pre>
    </details>
  );

  return (
    <article className="flex flex-col gap-12">
      <header className="min-w-0 max-w-[760px]">
        <p className="text-meta text-ink-3">
          {catalogNumber(source.id)}
          {" · "}
          {originLabel(source)}
          {" · Filed "}
          {formatDay(source.createdAt)}
        </p>
        <h1
          className={
            "mt-3 break-words font-medium " +
            (title.length > LONG_TITLE ? "text-lead" : "text-title")
          }
          data-testid="source-title"
        >
          {title}
        </h1>
        {source.url && (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-ui text-ink-2"
          >
            Open the original
            <ArrowUpRight aria-hidden size={16} strokeWidth={1.5} />
          </a>
        )}
      </header>

      {source.status === "failed" ? (
        <div
          className="max-w-[760px] rounded-box bg-danger-wash p-6 text-ui"
          data-testid="source-error"
        >
          <p className="font-semibold text-danger">Processing failed</p>
          {/* The raw error stays on the row and in the logs; it can name
              gateway hosts, which no reader needs to see. */}
          <p className="mt-1 text-ink-2" data-testid="failure-reason">
            {failureReason(source.errorMessage)}
          </p>
          <p className="mt-1 text-ink-2">
            The captured text is saved, so trying again starts from it.
          </p>
          <RetrySourceButton sourceId={source.id} />
        </div>
      ) : source.status === "pending" ? (
        <div className="max-w-[760px] rounded-box bg-raised p-6 text-ui">
          <p className="font-semibold">Waiting to be processed</p>
          <p className="mt-1 text-ink-2">
            Its note and flashcards appear here once they are written. Refresh
            the page to check.
          </p>
        </div>
      ) : null}

      {hasNotes ? (
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16">
          <div className="flex min-w-0 flex-col gap-12">
            {processing && (
              <section data-testid="why-i-cared" aria-label="Why I cared">
                <IndexCard head="Why I cared">
                  <p>{processing.whyICared}</p>
                </IndexCard>
              </section>
            )}

            {takeaways.length > 0 && (
              <section data-testid="takeaways">
                <h2 className="section-title mb-4">Key takeaways</h2>
                <ol className="flex flex-col gap-4">
                  {takeaways.map((t, i) => (
                    <li key={i} className="grid grid-cols-[24px_1fr] text-ui">
                      <span className="text-ink-3">{i + 1}</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {source.status === "processed" && (
              <section data-testid="cards-section">
                <div
                  className={
                    "mb-6 flex flex-wrap items-start justify-between gap-4"
                  }
                >
                  <div>
                    <h2 className="section-title">
                      Flashcards{" "}
                      <span className="font-normal text-ink-3">{cards.length}</span>
                    </h2>
                    {cards.length > 0 && (
                      <p className="mt-1 text-ui text-ink-2">
                        Filed for review.{" "}
                        <Link href="/review">Review due cards</Link>
                      </p>
                    )}
                  </div>
                  <GenerateCardsButton sourceId={source.id} />
                </div>
                {cards.length > 0 ? (
                  <ul className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
                    {cards.map((card) => (
                      <IndexCard
                        as="li"
                        size="small"
                        key={card.id}
                        head={cardTypeLabel(card.cardType)}
                        data-testid={`card-${card.id}`}
                      >
                        <p className="index-card__front">{card.front}</p>
                        <p className="index-card__back">{card.back}</p>
                      </IndexCard>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ui text-ink-2">
                    No cards yet. Generate some from the captured text.
                  </p>
                )}
              </section>
            )}
            {captured}
          </div>

          {(concepts.length > 0 || related.length > 0) && (
            <aside className="flex flex-col gap-10 lg:pt-1">
              {concepts.length > 0 && (
                <section>
                  <h2 className="text-ui font-semibold">Main ideas</h2>
                  <ol className="mt-3 flex flex-col gap-2 text-ui">
                    {concepts.map((c, i) => (
                      <li
                        key={c.name}
                        className="grid grid-cols-[24px_1fr] break-words"
                      >
                        <span className="text-ink-3">{i + 1}</span>
                        <span>{c.name}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {related.length > 0 && (
                <section data-testid="related-section">
                  <h2 className="text-ui font-semibold">See also</h2>
                  <p className="mt-1 text-meta text-ink-3">
                    Captures on nearby ideas, closest first
                  </p>
                  <ul className="mt-3 flex flex-col">
                    {related.map(({ source: r }) => (
                      <li key={r.id} className="border-t border-line py-3">
                        <Link
                          href={`/sources/${r.id}`}
                          className={
                            "line-clamp-2 text-meta text-ink no-underline " +
                            "hover:text-accent"
                          }
                        >
                          {displayTitle(r.title)}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </aside>
          )}
        </div>
      ) : (
        <div className="max-w-[760px]">{captured}</div>
      )}
    </article>
  );
}
