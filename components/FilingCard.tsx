"use client";

import { useEffect, useRef, useState } from "react";
import { IndexCard } from "@/components/IndexCard";

const STEPS = [
  "Reading the source",
  "Pulling out the text",
  "Writing your note",
  "Drafting flashcards",
  "Naming the main ideas",
];

const STEP_MS = 1500;

// The capture being filed, typed onto a card line by line while the request
// runs. The steps follow a timer, not the server: they show what happens,
// in order, without claiming exact progress.
export function FilingCard({
  title,
  className = "",
}: {
  title: string;
  className?: string;
}) {
  const [step, setStep] = useState(0);
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(
      () => setStep((s) => Math.min(STEPS.length - 1, s + 1)),
      STEP_MS,
    );
    return () => clearInterval(timer);
  }, []);

  // Keep the whole card in view above the phone's bottom menu as it grows.
  // A copy that is display: none (the other layout's) doesn't scroll.
  useEffect(() => {
    card.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [step]);

  return (
    <div ref={card} className={"scroll-mb-24 " + className}>
      <IndexCard
        size="small"
        head="Filing now"
        aria-live="polite"
      >
        <p className="index-card__front">{title}</p>
        <ol className="mt-[var(--rule-gap)] text-ink-2">
          {STEPS.slice(0, step + 1).map((s, i) => (
            <li key={s} className="flex justify-between gap-4">
              <span className="min-w-0 truncate">{s}</span>
              <span
                className={"shrink-0 " + (i < step ? "text-ink-3" : "text-accent")}
              >
                {i < step ? "done" : "now"}
              </span>
            </li>
          ))}
        </ol>
      </IndexCard>
    </div>
  );
}
