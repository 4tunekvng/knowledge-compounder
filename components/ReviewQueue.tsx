"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CAPTURE_ACTION, EmptyCard } from "@/components/EmptyCard";
import { CardStack, IndexCard } from "@/components/IndexCard";
import {
  cardTypeLabel,
  countLabel,
  displayTitle,
  formatInterval,
} from "@/lib/format";

interface ReviewCard {
  id: number;
  cardType: "definition" | "mechanism" | "application";
  front: string;
  back: string;
  source: { id: number; title: string };
  // Milliseconds until the card is due again for each grade, Again..Easy.
  nextIn: number[];
}

interface Props {
  cards: ReviewCard[];
  // Every card due when the page loaded; a round loads at most 50 of them.
  dueTotal: number;
  // Milliseconds until the next card not yet due comes back; null when the
  // reader has no cards at all.
  nextDueIn: number | null;
}

// FSRS-6 ratings: 1=Again 2=Hard 3=Good 4=Easy
const GRADE_BUTTONS: { grade: number; label: string; description: string }[] = [
  { grade: 1, label: "Again", description: "Couldn't recall" },
  { grade: 2, label: "Hard", description: "Recalled with difficulty" },
  { grade: 3, label: "Good", description: "Recalled with hesitation" },
  { grade: 4, label: "Easy", description: "Perfect recall" },
];

/** Graded cards grouped by when they come back, soonest first. */
function returnSchedule(waits: number[]): { when: string; count: number }[] {
  const groups = new Map<string, number>();
  for (const ms of [...waits].sort((a, b) => a - b)) {
    const when = formatInterval(ms);
    groups.set(when, (groups.get(when) ?? 0) + 1);
  }
  return Array.from(groups, ([when, count]) => ({ when, count }));
}

// One neutral style for every grade; the accent marks the expected answer.
const GOOD_GRADE = 3;

export function ReviewQueue({ cards, dueTotal, nextDueIn }: Props) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // How long each graded card was put away for, in milliseconds.
  const [completed, setCompleted] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Counts down as cards are graded, so it never claims cards are due that
  // this round already put away.
  const stillDue = Math.max(0, dueTotal - completed.length);
  const dueLine = (
    <p className="-mt-5 text-ui text-ink-2">
      {stillDue === 0
        ? "No cards due now"
        : `${countLabel(stillDue, "card")} due now`}
      {stillDue > cards.length - completed.length &&
        cards.length > completed.length &&
        `, the first ${cards.length - completed.length} in this round`}
    </p>
  );

  const withDueLine = (node: ReactNode) => (
    <>
      {dueLine}
      {node}
    </>
  );

  // A finished round stays on screen even after the refresh below brings
  // in an empty (or new) list, until the reader asks for more.
  const allDone = completed.length > 0 && index >= cards.length;

  // The card says there is nothing to review, so no count line above it.
  if (cards.length === 0 && !allDone) {
    return (
      <EmptyCard
        head={nextDueIn === null ? "No cards yet" : "Nothing due"}
        action={CAPTURE_ACTION}
        data-testid="review-empty"
      >
        {nextDueIn === null
          ? "No flashcards yet. Capture something you read and its cards " +
            "start here."
          : `Nothing to review right now. Your next card comes back ` +
            `${formatInterval(nextDueIn)}.`}
      </EmptyCard>
    );
  }

  if (allDone) {
    return withDueLine(
      <div data-testid="review-done">
        <IndexCard
          head="Round done"
          aside={countLabel(completed.length, "card")}
          footer={
            <button
              onClick={() =>
                // Client state outlives router.refresh(), so restart the
                // queue in the same transition that brings in the newly due
                // cards.
                startTransition(() => {
                  setIndex(0);
                  setCompleted([]);
                  setRevealed(false);
                  router.refresh();
                })
              }
              className="btn btn-secondary"
            >
              Check for more
            </button>
          }
        >
          <h2 className="index-card__front">
            You graded {countLabel(completed.length, "card")}.
          </h2>
          {/* When they come back, soonest first: the spacing at work. */}
          <ul className="index-card__back">
            {returnSchedule(completed).map(({ when, count }) => (
              <li key={when} className="flex justify-between gap-4">
                <span>Back {when}</span>
                <span>{countLabel(count, "card")}</span>
              </li>
            ))}
          </ul>
        </IndexCard>
      </div>
    );
  }

  const card = cards[index];

  function grade(value: number) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: card.id, grade: value }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to grade card.");
          return;
        }
        setCompleted((prev) => [...prev, card.nextIn[value - 1]]);
        setRevealed(false);
        setIndex((i) => i + 1);
        // The last card of the round: refresh the server's counts (the
        // menu's due number) so the page agrees with the finished round.
        if (index + 1 >= cards.length) router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  return withDueLine(
    <div className="flex flex-col gap-8" data-testid="review-card">
      <div>
        <CardStack under={cards.length - index - 1}>
          <IndexCard
            key={card.id}
            head={cardTypeLabel(card.cardType)}
            aside={`${index + 1} of ${cards.length}`}
            className="min-h-[264px]"
          >
            <p className="index-card__front" data-testid="card-front">
              {card.front}
            </p>
            {revealed && (
              <p className="index-card__back reveal" data-testid="card-back">
                {card.back}
              </p>
            )}
          </IndexCard>
        </CardStack>
        <p className="mt-6 text-meta text-ink-3">
          From{" "}
          <Link
            href={`/sources/${card.source.id}`}
            className="text-ink-2 no-underline hover:underline"
          >
            {displayTitle(card.source.title)}
          </Link>
        </p>
      </div>

      {revealed ? (
        // On a phone the grades stay pinned above the menu, so a long answer
        // never pushes them off screen.
        <div
          className={
            "sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 " +
            "grid grid-cols-2 gap-3 bg-paper px-4 py-3 " +
            "sm:static sm:mx-0 sm:grid-cols-4 sm:p-0"
          }
          data-testid="grade-buttons"
        >
          {GRADE_BUTTONS.map((b) => (
            <button
              key={b.grade}
              onClick={() => grade(b.grade)}
              disabled={isPending}
              data-testid={`grade-${b.grade}`}
              className={
                "btn h-16 flex-col gap-0 " +
                (b.grade === GOOD_GRADE ? "btn-primary" : "btn-secondary")
              }
              title={b.description}
            >
              <span>{b.label}</span>
              <span className="text-meta font-normal opacity-80">
                {formatInterval(card.nextIn[b.grade - 1])}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={() => setRevealed(true)}
          data-testid="reveal-button"
          className="btn btn-primary h-16 w-full sm:h-11 sm:w-auto sm:self-start"
        >
          Show answer
        </button>
      )}

      {error && (
        <p className="text-ui text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
