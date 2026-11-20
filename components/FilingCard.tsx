"use client";

import { useEffect, useRef, useState } from "react";
import { IndexCard } from "@/components/IndexCard";
import { catalogNumber } from "@/lib/format";

/** A capture on its way in, as the server reports it (see /api/capture). */
export interface Filing {
  title: string;
  startedAt: number;
  // Set once the server has read the capture and saved it.
  filed?: { sourceId: number; chars: number; at: number };
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// The capture being filed, typed onto a card as each real stage finishes:
// read and saved (reported by the server), then the note and flashcards
// being written, with the time it has taken so far.
export function FilingCard({
  filing,
  className = "",
}: {
  filing: Filing;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keep the whole card in view above the phone's bottom menu as it grows.
  // A copy that is display: none (the other layout's) doesn't scroll.
  const stage = filing.filed ? "writing" : "reading";
  useEffect(() => {
    card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [stage]);

  const { filed } = filing;
  const lines: { text: string; status: string; now?: boolean }[] = filed
    ? [
        {
          text: `Read ${filed.chars.toLocaleString("en-GB")} characters`,
          status: "done",
        },
        { text: `Filed as ${catalogNumber(filed.sourceId)}`, status: "done" },
        {
          text: "Writing the note and cards",
          status: clock(now - filed.at),
          now: true,
        },
      ]
    : [{ text: "Reading it", status: clock(now - filing.startedAt), now: true }];

  return (
    <div ref={card} className={"scroll-mb-24 " + className}>
      <IndexCard
        size="small"
        head="Filing now"
        aside={filed ? "up to a minute" : undefined}
        aria-live="polite"
        data-testid="capture-progress"
      >
        <p className="index-card__front">{filing.title}</p>
        <ol className="mt-[var(--rule-gap)] text-ink-2">
          {lines.map((line) => (
            <li key={line.text} className="flex justify-between gap-4">
              <span className="min-w-0 truncate">{line.text}</span>
              <span
                className={
                  "shrink-0 tabular-nums " +
                  (line.now ? "text-accent" : "text-ink-3")
                }
              >
                {line.status}
              </span>
            </li>
          ))}
        </ol>
      </IndexCard>
    </div>
  );
}
