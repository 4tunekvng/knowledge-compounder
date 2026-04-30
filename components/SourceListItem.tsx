import Link from "next/link";
import type { Source } from "@/lib/db/schema";
import { parseConcepts } from "@/lib/services/queries";

interface Props {
  source: Source;
  whyICared: string | null;
  conceptsJson: string | null;
  cardCount: number;
}

export function SourceListItem({ source, whyICared, conceptsJson, cardCount }: Props) {
  const concepts = conceptsJson ? parseConcepts(conceptsJson) : [];
  return (
    <li
      className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-5"
      data-testid={`source-item-${source.id}`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-lg leading-tight">
          <Link
            href={`/sources/${source.id}`}
            className="text-[color:var(--foreground)] no-underline hover:text-[color:var(--accent)]"
          >
            {source.title}
          </Link>
        </h3>
        <StatusBadge status={source.status} />
      </div>
      {source.url && (
        <p className="text-xs text-[color:var(--muted)] mt-1 truncate">
          <a href={source.url} target="_blank" rel="noopener noreferrer">
            {source.url}
          </a>
        </p>
      )}
      {whyICared && (
        <p className="mt-3 text-sm text-[color:var(--foreground)] leading-relaxed line-clamp-3">
          {whyICared}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2 items-center">
        {concepts.slice(0, 5).map((c) => (
          <span
            key={c.name}
            className="text-xs text-[color:var(--muted)] border border-[color:var(--border)] rounded-full px-2 py-0.5"
          >
            {c.name}
          </span>
        ))}
        {concepts.length > 5 && (
          <span
            className="text-xs text-[color:var(--muted)]"
            title={concepts
              .slice(5)
              .map((c) => c.name)
              .join(", ")}
          >
            +{concepts.length - 5} more
          </span>
        )}
        {cardCount > 0 && (
          <span className="text-xs text-[color:var(--muted)] ml-auto">
            {cardCount} {cardCount === 1 ? "card" : "cards"}
          </span>
        )}
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: Source["status"] }) {
  const styles =
    status === "processed"
      ? "bg-green-100 text-green-800"
      : status === "failed"
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full ${styles}`}>
      {status}
    </span>
  );
}
