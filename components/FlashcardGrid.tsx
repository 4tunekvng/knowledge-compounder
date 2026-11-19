"use client";

import { useState } from "react";
import { IndexCard } from "@/components/IndexCard";
import { cardTypeLabel } from "@/lib/format";

const PREVIEW = 2;

interface Flashcard {
  id: number;
  cardType: string;
  front: string;
  back: string;
}

// Flashcards laid out as small index cards, two to a row from 768px up,
// each its own height. With `phonePreview`, a phone shows the first two and
// the rest on request, so a long set doesn't bury what follows it.
export function FlashcardGrid({
  cards,
  phonePreview = false,
  testIdPrefix,
}: {
  cards: Flashcard[];
  phonePreview?: boolean;
  testIdPrefix?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const folded = phonePreview && !showAll;

  return (
    <>
      <ul className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
        {cards.map((card, i) => (
          <IndexCard
            as="li"
            size="small"
            key={card.id}
            head={cardTypeLabel(card.cardType)}
            className={folded && i >= PREVIEW ? "hidden md:block" : ""}
            data-testid={testIdPrefix ? `${testIdPrefix}${card.id}` : undefined}
          >
            <p className="index-card__front">{card.front}</p>
            <p className="index-card__back">{card.back}</p>
          </IndexCard>
        ))}
      </ul>
      {folded && cards.length > PREVIEW && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="btn btn-secondary mt-6 w-full md:hidden"
        >
          Show all {cards.length}
        </button>
      )}
    </>
  );
}
