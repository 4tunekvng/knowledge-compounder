import Link from "next/link";
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

export default async function LibraryPage() {
  const user = await requireUser();
  const sources = await listSources(user.id, 200);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-title font-medium">Library</h1>
        <p className="mt-3 text-ui text-ink-2">
          {sources.length === 0
            ? "No captures yet"
            : `${countLabel(sources.length, "capture")}, newest first`}
        </p>
      </div>
      {sources.length === 0 ? (
        <div className="border-t border-line pt-6 text-ui text-ink-2">
          <p>
            Everything you capture is filed here, newest first.{" "}
            <Link href="/">Capture something you just read</Link>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-12" data-testid="library-list">
          {byMonth(sources).map(([month, items]) => (
            <section key={month} aria-label={month}>
              <h2 className="mb-2 flex items-baseline gap-3">
                <span className="section-title">{month}</span>
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
