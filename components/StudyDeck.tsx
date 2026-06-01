"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-md border border-[color:var(--border)] overflow-hidden">
        <button
          type="button"
          onClick={() => setMode("study")}
          data-testid="mode-study"
          className={`px-3 py-1.5 text-xs font-medium ${
            mode === "study"
              ? "bg-[color:var(--accent)] text-white"
              : "text-[color:var(--foreground)] hover:bg-[color:var(--card)]"
          }`}
        >
          Study
        </button>
        <button
          type="button"
          onClick={() => setMode("browse")}
          data-testid="mode-browse"
          className={`px-3 py-1.5 text-xs font-medium ${
            mode === "browse"
              ? "bg-[color:var(--accent)] text-white"
              : "text-[color:var(--foreground)] hover:bg-[color:var(--card)]"
          }`}
        >
          Browse all
        </button>
      </div>
      {mode === "study" && (
        <button
          type="button"
          onClick={shuffle}
          data-testid="shuffle"
          className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
        >
          🔀 Shuffle
        </button>
      )}
      <a
        href={`${exportBase}/pdf`}
        className="ml-auto rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium no-underline text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
      >
        ⬇ PDF
      </a>
      <a
        href={`${exportBase}/anki`}
        className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium no-underline text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
      >
        ⬇ Anki
      </a>
    </div>
  );

  if (cards.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {toolbar}
        <div
          className="border border-dashed border-[color:var(--border)] rounded-md p-10 text-center text-[color:var(--muted)]"
          data-testid="deck-empty"
        >
          This deck has no cards yet.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {toolbar}
      {mode === "browse" ? (
        <BrowseList cards={cards} />
      ) : atEnd ? (
        <div
          className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-10 text-center"
          data-testid="study-done"
        >
          <h2 className="font-serif text-2xl mb-2">You finished the deck</h2>
          <p className="text-[color:var(--muted)] mb-5">
            You went through all {order.length}{" "}
            {order.length === 1 ? "card" : "cards"}.
          </p>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={reset}
              className="rounded-md bg-[color:var(--accent)] text-white px-5 py-2 text-sm font-medium"
            >
              Study again
            </button>
            <button
              type="button"
              onClick={shuffle}
              className="rounded-md border border-[color:var(--border)] px-5 py-2 text-sm font-medium hover:border-[color:var(--accent)]"
            >
              Shuffle &amp; restart
            </button>
          </div>
        </div>
      ) : (
        card && (
          <div className="flex flex-col gap-4" data-testid="study-card">
            <div className="flex items-center justify-between text-sm text-[color:var(--muted)]">
              <span data-testid="study-progress">
                Card {pos + 1} of {order.length}
              </span>
              <span className="truncate ml-4 max-w-[60%] text-right">
                {card.sourceTitle}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-[color:var(--border)] overflow-hidden">
              <div
                className="h-full bg-[color:var(--accent)] transition-all"
                style={{ width: `${(pos / order.length) * 100}%` }}
              />
            </div>

            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="text-left border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-8 min-h-[220px] flex flex-col justify-center transition hover:border-[color:var(--accent)]"
            >
              <p className="text-[10px] uppercase tracking-wider text-[color:var(--accent)] mb-3">
                {card.cardType}
              </p>
              <p className="font-serif text-2xl leading-snug" data-testid="study-front">
                {card.front}
              </p>
              {revealed ? (
                <p
                  className="mt-5 pt-5 border-t border-[color:var(--border)] text-base leading-relaxed text-[color:var(--foreground)]"
                  data-testid="study-back"
                >
                  {card.back}
                </p>
              ) : (
                <p className="mt-5 text-sm text-[color:var(--muted)]">
                  Click to reveal the answer · or press Space
                </p>
              )}
            </button>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={prev}
                disabled={pos === 0}
                data-testid="study-prev"
                className="rounded-md border border-[color:var(--border)] px-4 py-2 text-sm font-medium disabled:opacity-40 hover:border-[color:var(--accent)]"
              >
                ← Previous
              </button>
              {!revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  data-testid="study-reveal"
                  className="flex-1 rounded-md bg-[color:var(--foreground)] text-[color:var(--background)] px-4 py-2 text-sm font-medium hover:opacity-80"
                >
                  Show answer
                </button>
              ) : (
                <button
                  type="button"
                  onClick={next}
                  data-testid="study-next"
                  className="flex-1 rounded-md bg-[color:var(--accent)] text-white px-4 py-2 text-sm font-medium hover:opacity-90"
                >
                  {pos + 1 === order.length ? "Finish" : "Next card →"}
                </button>
              )}
            </div>
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
    <div className="flex flex-col gap-6" data-testid="browse-list">
      {grouped.map(([sourceTitle, group]) => (
        <section key={sourceTitle} className="flex flex-col gap-3">
          <h3 className="font-serif text-lg text-[color:var(--muted)]">{sourceTitle}</h3>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.map((c) => (
              <li
                key={c.id}
                className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-4"
              >
                <p className="text-[10px] uppercase tracking-wider text-[color:var(--accent)] mb-2">
                  {c.cardType}
                </p>
                <p className="font-medium text-sm mb-2">{c.front}</p>
                <p className="text-sm text-[color:var(--muted)] leading-relaxed">{c.back}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
