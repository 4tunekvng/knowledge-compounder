"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, ExternalLink, Mail, Trash2 } from "lucide-react";
import { CardStack, IndexCard } from "@/components/IndexCard";
import { catalogNumber, countLabel, displayTitle } from "@/lib/format";

interface SourceOption {
  id: number;
  title: string;
  cardCount: number;
}

interface DeckView {
  id: number;
  title: string;
  description: string | null;
  shareToken: string;
  sourceIds: number[];
  cardCount: number;
  // Formatted on the server, so the server and browser show the same text.
  madeOn: string;
}

interface Props {
  sources: SourceOption[];
  decks: DeckView[];
  origin: string;
}

const PICKER_ROWS = 8;

export function DeckManager({ sources, decks, origin }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);
  // The picker is never a box that scrolls inside the page: it shows the
  // newest captures, and the rest on request.
  const hidden = showAll ? 0 : Math.max(0, sources.length - PICKER_ROWS);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCardCount = sources
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + s.cardCount, 0);

  function createDeck() {
    setCreateError(null);
    if (!title.trim()) {
      setCreateError("Give the deck a title");
      return;
    }
    if (selected.size === 0) {
      setCreateError("Pick at least one capture");
      return;
    }
    startCreating(async () => {
      try {
        const res = await fetch("/api/decks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || undefined,
            sourceIds: Array.from(selected),
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setCreateError(data?.error ?? "Failed to create deck.");
          return;
        }
        setTitle("");
        setDescription("");
        setSelected(new Set());
        router.refresh();
      } catch (err) {
        setCreateError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  function shareUrl(token: string) {
    return `${origin}/d/${token}`;
  }

  async function copyLink(deck: DeckView) {
    try {
      await navigator.clipboard.writeText(shareUrl(deck.shareToken));
      setCopiedId(deck.id);
      setTimeout(() => setCopiedId((id) => (id === deck.id ? null : id)), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  function removeDeck(deck: DeckView) {
    if (!confirm(`Delete deck "${deck.title}"? The share link will stop working.`)) {
      return;
    }
    setDeletingId(deck.id);
    startCreating(async () => {
      try {
        const res = await fetch(`/api/decks/${deck.id}`, { method: "DELETE" });
        if (res.ok) router.refresh();
      } finally {
        setDeletingId(null);
      }
    });
  }

  const form = (
    <section
      className="panel flex flex-col gap-6 p-6 lg:col-start-2 lg:row-start-1"
      aria-labelledby="new-deck-heading"
    >
      <div>
        <h2 id="new-deck-heading" className="section-title">
          Make a deck
        </h2>
        <p className="mt-1 text-ui text-ink-2">
          Pick the captures whose cards go in it.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="deck-title" className="text-ui font-medium">
          Title
        </label>
        <input
          id="deck-title"
          data-testid="deck-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Moats, week 3"
          className="field"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="deck-desc" className="text-ui font-medium">
          Note for students <span className="font-normal text-ink-3">optional</span>
        </label>
        <input
          id="deck-desc"
          data-testid="deck-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What to focus on"
          className="field"
        />
      </div>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="text-ui font-medium">Captures with flashcards</legend>
        {/* The rows sit straight in the panel, divided by hairlines. */}
        <ul data-testid="deck-source-list">
          {sources.slice(0, sources.length - hidden).map((s) => (
            <li key={s.id} className="border-t border-line">
              <label
                className={
                  "flex min-h-11 cursor-pointer items-start gap-3 py-3 " +
                  "hover:bg-raised"
                }
              >
                <input
                  type="checkbox"
                  data-testid={`deck-source-${s.id}`}
                  checked={selected.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="mt-0.5 size-[18px] shrink-0 accent-accent"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-meta">
                    {displayTitle(s.title, 80)}
                  </span>
                  <span className="block text-label text-ink-3">
                    {catalogNumber(s.id)} · {countLabel(s.cardCount, "card")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="btn btn-quiet btn-sm -ml-3 self-start"
          >
            Show all {sources.length}
          </button>
        )}
        <p className="text-meta text-ink-3" aria-live="polite">
          {selected.size === 0
            ? "None picked yet"
            : `${countLabel(selected.size, "capture")}, ` +
              `${countLabel(selectedCardCount, "card")}`}
        </p>
      </fieldset>
      {createError && (
        <p className="text-ui text-danger" role="alert" data-testid="deck-error">
          {createError}
        </p>
      )}
      <button
        type="button"
        onClick={createDeck}
        disabled={creating}
        data-testid="create-deck"
        className="btn btn-primary"
      >
        {creating && deletingId === null ? "Making the deck…" : "Make deck"}
      </button>
    </section>
  );

  return (
    <div
      className={
        "grid grid-cols-[minmax(0,1fr)] items-start gap-12 " +
        "lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-16"
      }
    >
      {decks.length === 0 && form}
      <section className="min-w-0 lg:col-start-1 lg:row-start-1">
        <h2 className="mb-2 flex items-baseline gap-3">
          <span className="section-title">Your decks</span>
          <span className="text-meta text-ink-3">{decks.length}</span>
        </h2>
        {decks.length === 0 ? (
          <div
            className="border-t border-line pt-4 text-ui text-ink-2"
            data-testid="decks-empty"
          >
            No decks yet. Make one and share its link with your students.
          </div>
        ) : (
          <ul data-testid="decks-list">
            {decks.map((deck) => (
              <li
                key={deck.id}
                data-testid={`deck-${deck.id}`}
                className={
                  "grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-line py-8 " +
                  "sm:grid-cols-[136px_minmax(0,1fr)] sm:gap-8"
                }
              >
                {/* The deck as a pack of cards; the pack thickens with it. */}
                <div aria-hidden className="hidden pt-1 sm:block">
                  <CardStack under={deck.cardCount - 1}>
                    <IndexCard
                      size="small"
                      head={countLabel(deck.cardCount, "card")}
                      className="h-[84px]"
                    >
                      {null}
                    </IndexCard>
                  </CardStack>
                </div>
                <div className="flex min-w-0 flex-col gap-4">
                  <div>
                    <h3 className="text-lead font-medium">{deck.title}</h3>
                    {deck.description && (
                      <p className="mt-1 text-ui text-ink-2">{deck.description}</p>
                    )}
                    <p className="mt-2 text-meta text-ink-3">
                      {countLabel(deck.cardCount, "card")} from{" "}
                      {countLabel(deck.sourceIds.length, "capture")} · made{" "}
                      {deck.madeOn}
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    {/* The whole link, wrapped onto a second line if it must,
                        so nobody copies it by hand with the end cut off. */}
                    <p
                      className={
                        "min-w-0 flex-1 rounded-box bg-raised px-3 py-2.5 " +
                        "text-meta text-ink-2 break-all select-all"
                      }
                      aria-label="Share link"
                      data-testid={`deck-link-${deck.id}`}
                    >
                      {shareUrl(deck.shareToken)}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyLink(deck)}
                      data-testid={`copy-link-${deck.id}`}
                      className="btn btn-secondary shrink-0"
                    >
                      <Copy aria-hidden size={16} strokeWidth={1.5} />
                      {copiedId === deck.id ? "Copied" : "Copy link"}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={`/d/${deck.shareToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary px-3"
                    >
                      <ExternalLink aria-hidden size={16} strokeWidth={1.5} />
                      Student view
                    </a>
                    <a
                      href={`/d/${deck.shareToken}/pdf`}
                      className="btn btn-secondary px-3"
                    >
                      <Download aria-hidden size={16} strokeWidth={1.5} />
                      PDF
                    </a>
                    <a
                      href={`/d/${deck.shareToken}/anki`}
                      className="btn btn-secondary px-3"
                    >
                      <Download aria-hidden size={16} strokeWidth={1.5} />
                      Anki
                    </a>
                    <a
                      href={`mailto:?subject=${encodeURIComponent(
                        `Study deck: ${deck.title}`,
                      )}&body=${encodeURIComponent(
                        `Here's a flashcard deck to study:\n\n${shareUrl(deck.shareToken)}\n\nOpen it in your browser to study, or download it for Anki.`,
                      )}`}
                      className="btn btn-secondary px-3"
                    >
                      <Mail aria-hidden size={16} strokeWidth={1.5} />
                      Email
                    </a>
                  </div>
                  {/* Delete stands apart from the everyday actions. */}
                  <div className="border-t border-line pt-3">
                    <button
                      type="button"
                      onClick={() => removeDeck(deck)}
                      disabled={deletingId === deck.id}
                      data-testid={`delete-deck-${deck.id}`}
                      className="btn btn-danger btn-sm -ml-3"
                    >
                      <Trash2 aria-hidden size={16} strokeWidth={1.5} />
                      {deletingId === deck.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      {decks.length > 0 && form}
    </div>
  );
}
