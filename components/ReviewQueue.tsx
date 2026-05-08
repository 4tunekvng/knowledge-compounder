"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ReviewCard {
  id: number;
  cardType: "definition" | "mechanism" | "application";
  front: string;
  back: string;
  source: { id: number; title: string };
}

interface Props {
  cards: ReviewCard[];
}

// FSRS-5 ratings: 1=Again 2=Hard 3=Good 4=Easy
const GRADE_BUTTONS: { grade: number; label: string; description: string; color: string }[] = [
  { grade: 1, label: "Again", description: "Couldn't recall", color: "bg-red-700" },
  { grade: 2, label: "Hard", description: "Recalled with difficulty", color: "bg-orange-600" },
  { grade: 3, label: "Good", description: "Recalled with hesitation", color: "bg-emerald-600" },
  { grade: 4, label: "Easy", description: "Perfect recall", color: "bg-emerald-800" },
];

export function ReviewQueue({ cards }: Props) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<number[]>([]);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  if (cards.length === 0) {
    return (
      <div
        className="border border-dashed border-[color:var(--border)] rounded-md p-8 text-center text-[color:var(--muted)]"
        data-testid="review-empty"
      >
        No cards due. Capture more material or come back tomorrow.
      </div>
    );
  }

  const allDone = index >= cards.length;
  if (allDone) {
    return (
      <div
        className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-8 text-center"
        data-testid="review-done"
      >
        <h2 className="font-serif text-2xl mb-2">Queue cleared</h2>
        <p className="text-[color:var(--muted)] mb-4">
          You graded {completed.length} {completed.length === 1 ? "card" : "cards"}.
        </p>
        <button
          onClick={() => router.refresh()}
          className="rounded-md bg-[color:var(--accent)] px-5 py-2 text-sm font-medium text-white"
        >
          Refresh queue
        </button>
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
        setCompleted((prev) => [...prev, card.id]);
        setRevealed(false);
        setIndex((i) => i + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5" data-testid="review-card">
      <div className="flex items-baseline justify-between text-sm text-[color:var(--muted)]">
        <span>
          Card {index + 1} of {cards.length}
        </span>
        <span>
          From{" "}
          <Link href={`/sources/${card.source.id}`}>{card.source.title}</Link>
        </span>
      </div>

      <div className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-8">
        <p className="text-[10px] uppercase tracking-wider text-[color:var(--accent)] mb-3">
          {card.cardType}
        </p>
        <p
          className="font-serif text-2xl leading-snug mb-6"
          data-testid="card-front"
        >
          {card.front}
        </p>
        {revealed ? (
          <p
            className="text-base leading-relaxed text-[color:var(--foreground)]"
            data-testid="card-back"
          >
            {card.back}
          </p>
        ) : (
          <button
            onClick={() => setRevealed(true)}
            data-testid="reveal-button"
            className="border border-[color:var(--border)] rounded-md px-5 py-2 text-sm hover:bg-[color:var(--background)]"
          >
            Reveal answer
          </button>
        )}
      </div>

      {revealed && (
        <div className="flex flex-wrap gap-2" data-testid="grade-buttons">
          {GRADE_BUTTONS.map((b) => (
            <button
              key={b.grade}
              onClick={() => grade(b.grade)}
              disabled={isPending}
              data-testid={`grade-${b.grade}`}
              className={`flex-1 min-w-[110px] rounded-md text-white px-4 py-3 text-sm font-medium ${b.color} disabled:opacity-50`}
              title={b.description}
            >
              <div>{b.label}</div>
              <div className="text-xs font-normal opacity-80">{b.description}</div>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
