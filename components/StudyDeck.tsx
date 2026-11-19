"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Download, Shuffle } from "lucide-react";
import { FlashcardGrid } from "@/components/FlashcardGrid";
import { CardStack, IndexCard } from "@/components/IndexCard";
import { cardTypeLabel, countLabel, displayTitle } from "@/lib/format";

interface StudyCard {
  id: number;
  cardType: "definition" | "mechanism" | "application";
  front: string;
  back: string;
  sourceTitle: string;
}

interface Props {
  title: string;
  cards: StudyCard[];
  exportBase: string; // e.g. "/d/<token>"
}

export function StudyDeck({ cards, exportBase }: Props) {
  const [mode, setMode] = useState<"study" | "browse">("study");
  const [order, setOrder] = useState<number[]>(() => cards.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const reset = useCallback(() => {
    setOrder(cards.map((_, i) => i));
    setPos(0);
    setRevealed(false);
  }, [cards]);

  const shuffle = useCallback(() => {
    const next = cards.map((_, i) => i);
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
    setPos(0);
    setRevealed(false);
  }, [cards]);

  const atEnd = pos >= order.length;
  const card = atEnd ? null : cards[order[pos]];

  const next = useCallback(() => {
    setRevealed(false);
    setPos((p) => Math.min(order.length, p + 1));
  }, [order.length]);

  const prev = useCallback(() => {
    setRevealed(false);
    setPos((p) => Math.max(0, p - 1));
  }, []);

  useEffect(() => {
    if (mode !== "study") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (atEnd) return;
        setRevealed((r) => !r);
      } else if (e.key === "ArrowRight") {
        next();
      } else if (e.key === "ArrowLeft") {
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, atEnd, next, prev]);

  const modeButton = (value: "study" | "browse", label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      data-testid={`mode-${value}`}
      aria-pressed={mode === value}
      className={
        "btn btn-sm min-h-10 w-full rounded-box " +
        (mode === value ? "bg-stock text-ink ring-1 ring-line" : "btn-quiet")
      }
    >
      {label}
    </button>
  );

  // On a phone: the two modes share one full-width row, and the actions
  // share the next as equal buttons. From 640px up it is one row.
  const toolbar = (
    <div
      className={
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      <div className="grid grid-cols-2 rounded-control bg-raised p-1 sm:w-64">
        {modeButton("study", "Study")}
        {modeButton("browse", "Browse all")}
      </div>
      <div className="grid auto-cols-fr grid-flow-col gap-2">
        {mode === "study" && (
          <button
            type="button"
            onClick={shuffle}
            data-testid="shuffle"
            className="btn btn-secondary px-3"
          >
            <Shuffle aria-hidden size={16} strokeWidth={1.5} />
            Shuffle
          </button>
        )}
        <a href={`${exportBase}/pdf`} className="btn btn-secondary px-3">
          <Download aria-hidden size={16} strokeWidth={1.5} />
          PDF
        </a>
        <a href={`${exportBase}/anki`} className="btn btn-secondary px-3">
          <Download aria-hidden size={16} strokeWidth={1.5} />
          Anki
        </a>
      </div>
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {toolbar}
        <div data-testid="deck-empty">
          <IndexCard head="Empty deck">
            <p className="index-card__front">This deck has no cards yet.</p>
          </IndexCard>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {toolbar}
      {mode === "browse" ? (
        <BrowseList cards={cards} />
      ) : atEnd ? (
        <div className="flex flex-col gap-8" data-testid="study-done">
          <IndexCard head="Finished">
            <h2 className="index-card__front">You finished the deck.</h2>
            <p className="index-card__back">
              You went through all {countLabel(order.length, "card")}.
            </p>
          </IndexCard>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={reset} className="btn btn-primary">
              Study again
            </button>
            <button type="button" onClick={shuffle} className="btn btn-secondary">
              <Shuffle aria-hidden size={16} strokeWidth={1.5} />
              Shuffle and restart
            </button>
          </div>
        </div>
      ) : (
        card && (
          <div className="flex flex-col gap-8" data-testid="study-card">
            <div>
              <CardStack under={order.length - pos - 1}>
                <IndexCard
                  key={card.id}
                  head={cardTypeLabel(card.cardType)}
                  aside={
                    <span data-testid="study-progress">
                      Card {pos + 1} of {order.length}
                    </span>
                  }
                  className="min-h-[196px] cursor-pointer sm:min-h-[264px]"
                  onClick={() => setRevealed((r) => !r)}
                >
                  <p className="index-card__front" data-testid="study-front">
                    {card.front}
                  </p>
                  {revealed && (
                    <p className="index-card__back reveal" data-testid="study-back">
                      {card.back}
                    </p>
                  )}
                </IndexCard>
              </CardStack>
              <p className="mt-6 text-meta text-ink-3">
                From {displayTitle(card.sourceTitle)}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={prev}
                disabled={pos === 0}
                data-testid="study-prev"
                aria-label="Previous card"
                className={
                  "btn btn-secondary h-16 w-16 px-0 sm:h-11 sm:w-auto sm:px-5"
                }
              >
                <ArrowLeft aria-hidden size={16} strokeWidth={1.5} />
                <span className="hidden sm:inline">Previous</span>
              </button>
              {!revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  data-testid="study-reveal"
                  className="btn btn-primary h-16 flex-1 sm:h-11"
                >
                  Show answer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  data-testid="study-next"
                  className="btn btn-primary h-16 flex-1 sm:h-11"
                >
                  {pos + 1 === order.length ? "Finish" : "Next card"}
                  {pos + 1 < order.length && (
                    <ArrowRight aria-hidden size={16} strokeWidth={1.5} />
                  )}
                </button>
              )}
            </div>
            <p className="hidden text-meta text-ink-3 sm:block">
              Space turns the card over. The arrow keys move between cards.
            </p>
          </div>
        )
      )}
    </div>
  );
}

function BrowseList({ cards }: { cards: StudyCard[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, StudyCard[]>();
    for (const c of cards) {
      const list = map.get(c.sourceTitle) ?? [];
      list.push(c);
      map.set(c.sourceTitle, list);
    }
    return Array.from(map.entries());
  }, [cards]);

  return (
    <div className="flex flex-col gap-12" data-testid="browse-list">
      {grouped.map(([sourceTitle, group]) => (
        <section key={sourceTitle} className="flex flex-col gap-4">
          <h3 className="text-ui font-semibold">{displayTitle(sourceTitle)}</h3>
          <FlashcardGrid cards={group} />
        </section>
      ))}
    </div>
  );
}
