import Link from "next/link";
import type { Source } from "@/lib/db/schema";
import {
  catalogNumber,
  countLabel,
  formatDay,
  originLabel,
} from "@/lib/format";
import { parseConcepts } from "@/lib/services/queries";

interface Props {
  source: Source;
  whyICared: string | null;
  conceptsJson: string | null;
  cardCount: number;
  // The short form used beside the capture card on the home page.
  compact?: boolean;
}

const SHOWN_CONCEPTS = 4;

// One entry in the catalogue: its number in the gutter, the title, where it
// came from, and (in the library) the note and the ideas it is filed under.
export function SourceListItem({
  source,
  whyICared,
  conceptsJson,
  cardCount,
  compact = false,
}: Props) {
  const concepts = conceptsJson ? parseConcepts(conceptsJson) : [];
  const number = catalogNumber(source.id);
  const status = statusText(source, cardCount);
  // The short form carries its status in the meta line; the library gives it
  // a column of its own.
  const meta = compact
    ? [originLabel(source), status].join(" · ")
    : [originLabel(source), formatDay(source.createdAt)].join(" · ");

  return (
    <li
      className={
        "group relative grid min-w-0 border-t border-line " +
        (compact
          ? "py-4"
          : "grid-cols-[minmax(0,1fr)_auto] gap-x-6 py-6 " +
            "sm:grid-cols-[64px_minmax(0,1fr)_auto]")
      }
      data-testid={`source-item-${source.id}`}
    >
      {!compact && (
        <span
          aria-hidden
          className="hidden pt-1 font-typed text-meta text-ink-3 sm:block"
        >
          {number}
        </span>
      )}
      <div className="min-w-0">
        <h3
          className={
            "line-clamp-2 break-words font-medium " +
            (compact ? "text-ui" : "text-read")
          }
        >
          {/* The link covers the whole entry, so the row is one target. */}
          <Link
            href={`/sources/${source.id}`}
            className={
              "text-ink no-underline after:absolute after:inset-0 " +
              "group-hover:text-accent"
            }
          >
            {source.title}
          </Link>
        </h3>
        <p className="mt-1 truncate text-meta text-ink-3">
          <span className={compact ? "font-typed" : "font-typed sm:hidden"}>
            {number} ·{" "}
          </span>
          {meta}
        </p>
        {!compact && whyICared && (
          <p className="mt-3 line-clamp-2 max-w-[44rem] text-ui text-ink-2">
            {whyICared}
          </p>
        )}
        {!compact && concepts.length > 0 && (
          <p className="mt-3 text-meta text-ink-3">
            {concepts
              .slice(0, SHOWN_CONCEPTS)
              .map((c) => c.name)
              .join(" · ")}
            {concepts.length > SHOWN_CONCEPTS &&
              ` · ${concepts.length - SHOWN_CONCEPTS} more`}
          </p>
        )}
      </div>
      {!compact && (
        <span
          data-testid={`source-status-${source.id}`}
          className={
            "shrink-0 pt-1 text-meta " +
            (source.status === "failed" ? "text-danger" : "text-ink-3")
          }
        >
          {status}
        </span>
      )}
    </li>
  );
}

function statusText(source: Source, cardCount: number): string {
  if (source.status === "failed") return "Failed";
  if (source.status === "pending") return "Waiting";
  return countLabel(cardCount, "card");
}
