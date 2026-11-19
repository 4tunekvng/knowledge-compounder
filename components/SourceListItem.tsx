import Link from "next/link";
import type { Source } from "@/lib/db/schema";
import {
  catalogNumber,
  countLabel,
  cutAtWord,
  displayTitle,
  formatDay,
  originLabel,
} from "@/lib/format";
import { failureReason } from "@/lib/error-copy";
import { parseConcepts } from "@/lib/services/queries";
import { RetrySourceButton } from "@/components/RetrySourceButton";

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
  const failed = source.status === "failed";
  const status = failed
    ? "Failed"
    : source.status === "pending"
      ? "Waiting"
      : countLabel(cardCount, "card");
  // Each part keeps its words together; the line wraps between parts, so a
  // date or a count is never cut off on a narrow screen.
  const meta = [
    ...(compact ? [catalogNumber(source.id)] : []),
    originLabel(source),
    ...(compact ? [] : [formatDay(source.createdAt)]),
  ];

  return (
    <li
      className={
        "group relative flex min-w-0 gap-x-6 border-t border-line " +
        (compact ? "py-4" : "py-6")
      }
      data-testid={`source-item-${source.id}`}
    >
      {!compact && (
        <span
          aria-hidden
          className={
            "hidden w-14 shrink-0 pt-0.5 text-right text-meta text-ink-3 " +
            "tabular-nums sm:block"
          }
        >
          {catalogNumber(source.id)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-ui font-medium">
          {/* The link covers the whole entry, so the row is one target. */}
          <Link
            href={`/sources/${source.id}`}
            className={
              "text-ink no-underline after:absolute after:inset-0 " +
              "group-hover:text-accent"
            }
          >
            {displayTitle(source.title, compact ? 90 : undefined)}
          </Link>
        </h3>
        <p className="mt-1 text-meta text-ink-3">
          {meta.map((part, i) => (
            <span key={i} className="inline-block max-w-full truncate align-top">
              {i > 0 && <span aria-hidden>&nbsp;·&nbsp;</span>}
              {part}
            </span>
          ))}
          <span
            data-testid={`source-status-${source.id}`}
            className={
              "inline-block " + (failed ? "text-danger" : "") +
              (compact ? "" : " sm:hidden")
            }
          >
            <span aria-hidden>&nbsp;·&nbsp;</span>
            {status}
          </span>
        </p>
        {!compact && failed && (
          <>
            <p className="mt-3 max-w-[44rem] text-meta text-ink-2">
              {failureReason(source.errorMessage)}
            </p>
            <RetrySourceButton sourceId={source.id} small />
          </>
        )}
        {!compact && whyICared && (
          <p className="mt-3 max-w-[44rem] text-meta text-ink-2">
            {cutAtWord(whyICared, 170)}
          </p>
        )}
        {!compact && concepts.length > 0 && (
          <p className="mt-3 text-meta text-ink-3">
            {concepts
              .slice(0, SHOWN_CONCEPTS)
              .map((c) => c.name)
              .join(" · ")}
            {concepts.length > SHOWN_CONCEPTS && (
              <span className="whitespace-nowrap">
                {" "}
                +{concepts.length - SHOWN_CONCEPTS} more
              </span>
            )}
          </p>
        )}
      </div>
      {!compact && (
        <span
          aria-hidden
          className={
            "hidden shrink-0 pt-0.5 text-meta sm:block " +
            (failed ? "text-danger" : "text-ink-3")
          }
        >
          {status}
        </span>
      )}
    </li>
  );
}
