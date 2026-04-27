import Link from "next/link";
import { SourceListItem } from "@/components/SourceListItem";
import { listSources } from "@/lib/services/queries";

export const dynamic = "force-dynamic";

export default function LibraryPage() {
  const sources = listSources(200);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-serif text-3xl tracking-tight">Library</h1>
        <p className="text-[color:var(--muted)] mt-1">
          {sources.length} {sources.length === 1 ? "source" : "sources"} captured.
        </p>
      </div>
      {sources.length === 0 ? (
        <div className="border border-dashed border-[color:var(--border)] rounded-md p-8 text-center text-[color:var(--muted)]">
          No sources yet.{" "}
          <Link href="/" className="text-[color:var(--accent)]">
            Capture one
          </Link>
          .
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="library-list">
          {sources.map(({ source, processing, cardCount }) => (
            <SourceListItem
              key={source.id}
              source={source}
              whyICared={processing?.whyICared ?? null}
              conceptsJson={processing?.concepts ?? null}
              cardCount={cardCount}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
