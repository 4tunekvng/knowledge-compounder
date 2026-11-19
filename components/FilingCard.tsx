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
export function FilingCard({ title }: { title: string }) {
  const [step, setStep] = useState(0);
  const card = useRef<HTMLDivElement>(null);

  // On a phone the card lands below the capture form; bring it into view.
  useEffect(() => {
    const phone = window.matchMedia("(max-width: 639px)").matches;
    card.current?.scrollIntoView({
      block: phone ? "start" : "nearest",
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    const timer = setInterval(
      () => setStep((s) => Math.min(STEPS.length - 1, s + 1)),
      STEP_MS,
    );
    return () => clearInterval(timer);
  }, []);

  return (
    <div ref={card} className="scroll-mt-4">
      <IndexCard
        size="small"
        head="Filing now"
        className="mb-4"
        data-testid="capture-processing"
        aria-live="polite"
      >
        <p className="index-card__front line-clamp-2">{title}</p>
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
