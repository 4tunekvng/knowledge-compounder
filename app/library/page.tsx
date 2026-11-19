import { CAPTURE_ACTION, EmptyCard } from "@/components/EmptyCard";
import { SourceListItem } from "@/components/SourceListItem";
import { countLabel, formatMonth } from "@/lib/format";
import { listSources, type SourceListItem as Item } from "@/lib/services/queries";
import { requireUser } from "@/lib/auth/user";

export const dynamic = "force-dynamic";

// Newest first, filed under the month each capture came in.
function byMonth(items: Item[]): [string, Item[]][] {
  const months = new Map<string, Item[]>();
  for (const item of items) {
    const month = formatMonth(item.source.createdAt);
    months.set(month, [...(months.get(month) ?? []), item]);
  }
  return Array.from(months.entries());
}

// Each capture as one card edge, standing in its month's drawer: the box
// visibly fills up as the months go by. Past this many the strip stops
// growing, so a busy month can't run off the line.
const MAX_EDGES = 60;

export default async function LibraryPage() {
  const user = await requireUser();
  const sources = await listSources(user.id, 200);
  const failed = sources.filter((s) => s.source.status === "failed").length;

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-title font-medium">Library</h1>
        <p className="mt-3 text-ui text-ink-2">
          {sources.length === 0
            ? "No captures yet"
            : `${countLabel(sources.length, "capture")}` +
              (failed > 0 ? ` (${failed} failed)` : "") +
              ", newest first"}
        </p>
      </div>
      {sources.length === 0 ? (
        <EmptyCard head="Empty drawer" action={CAPTURE_ACTION}>
          Everything you capture is filed here, newest first, each with its
          note and flashcards.
        </EmptyCard>
      ) : (
        <div className="flex flex-col gap-12" data-testid="library-list">
          {byMonth(sources).map(([month, items]) => (
            <section key={month} aria-label={month}>
              {/* The drawer's front: a typed label in a buff holder, as on
                  the theme tabs, then one card edge per capture. */}
              <h2 className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span
                  className={
                    "rounded-box border border-line bg-guide px-3 py-1 " +
                    "font-typed text-meta"
                  }
                >
                  {month}
                </span>
                <span aria-hidden className="flex h-5 items-stretch gap-[3px]">
                  {items.slice(0, MAX_EDGES).map(({ source }) => (
                    <span key={source.id} className="w-[3px] bg-line-strong" />
                  ))}
                </span>
                <span className="text-label text-ink-3">
                  {countLabel(items.length, "capture")}
                </span>
              </h2>
              <ul>
                {items.map(({ source, processing, cardCount }) => (
                  <SourceListItem
                    key={source.id}
                    source={source}
                    whyICared={processing?.whyICared ?? null}
                    conceptsJson={processing?.concepts ?? null}
                    cardCount={cardCount}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
