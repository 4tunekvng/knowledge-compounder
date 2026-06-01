"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
  createdAt: number;
}

interface Props {
  sources: SourceOption[];
  decks: DeckView[];
  origin: string;
}

export function DeckManager({ sources, decks, origin }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, startCreating] = useTransition();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
      setCreateError("Give the deck a title.");
      return;
    }
    if (selected.size === 0) {
      setCreateError("Pick at least one source.");
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

  return (
    <div className="flex flex-col gap-10">
      {/* Create form */}
      <section className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-6">
        <h2 className="font-serif text-xl mb-4">Create a shareable deck</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deck-title" className="text-sm font-medium">
              Deck title
            </label>
            <input
              id="deck-title"
              data-testid="deck-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Competitive Moats — Week 3"
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm focus:border-[color:var(--accent)] focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="deck-desc" className="text-sm font-medium">
              Description <span className="text-[color:var(--muted)] font-normal">(optional)</span>
            </label>
            <input
              id="deck-desc"
              data-testid="deck-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A note for your students about what to focus on."
              className="rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-sm focus:border-[color:var(--accent)] focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">
              Sources{" "}
              <span className="text-[color:var(--muted)] font-normal">
                ({selected.size} selected · {selectedCardCount} cards)
              </span>
            </span>
            <ul
              className="max-h-64 overflow-auto rounded-md border border-[color:var(--border)] divide-y divide-[color:var(--border)]"
              data-testid="deck-source-list"
            >
              {sources.map((s) => (
                <li key={s.id}>
                  <label className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer hover:bg-[color:var(--background)]">
                    <input
                      type="checkbox"
                      data-testid={`deck-source-${s.id}`}
                      checked={selected.has(s.id)}
                      onChange={() => toggle(s.id)}
                      className="size-4 accent-[color:var(--accent)]"
                    />
                    <span className="flex-1 truncate">{s.title}</span>
                    <span className="text-xs text-[color:var(--muted)] shrink-0">
                      {s.cardCount} {s.cardCount === 1 ? "card" : "cards"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          {createError && (
            <p className="text-sm text-red-700" role="alert" data-testid="deck-error">
              {createError}
            </p>
          )}
          <div>
            <button
              type="button"
              onClick={createDeck}
              disabled={creating}
              data-testid="create-deck"
              className="rounded-md bg-[color:var(--accent)] text-white px-5 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
            >
              {creating && deletingId === null ? "Creating…" : "Create shareable deck"}
            </button>
          </div>
        </div>
      </section>

      {/* Existing decks */}
      <section>
        <h2 className="font-serif text-xl mb-4">
          Your decks{" "}
          <span className="text-[color:var(--muted)] text-base font-normal">
            ({decks.length})
          </span>
        </h2>
        {decks.length === 0 ? (
          <div
            className="border border-dashed border-[color:var(--border)] rounded-md p-8 text-center text-[color:var(--muted)]"
            data-testid="decks-empty"
          >
            No decks yet. Create one above and share the link with your students.
          </div>
        ) : (
          <ul className="flex flex-col gap-4" data-testid="decks-list">
            {decks.map((deck) => (
              <li
                key={deck.id}
                data-testid={`deck-${deck.id}`}
                className="border border-[color:var(--border)] bg-[color:var(--card)] rounded-md p-5 flex flex-col gap-3"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="font-serif text-lg">{deck.title}</h3>
                  <span className="text-xs text-[color:var(--muted)] shrink-0">
                    {deck.cardCount} {deck.cardCount === 1 ? "card" : "cards"} ·{" "}
                    {deck.sourceIds.length}{" "}
                    {deck.sourceIds.length === 1 ? "source" : "sources"}
                  </span>
                </div>
                {deck.description && (
                  <p className="text-sm text-[color:var(--muted)]">{deck.description}</p>
                )}

                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl(deck.shareToken)}
                    data-testid={`deck-link-${deck.id}`}
                    onFocus={(e) => e.currentTarget.select()}
                    className="flex-1 rounded-md border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-xs font-mono text-[color:var(--muted)]"
                  />
                  <button
                    type="button"
                    onClick={() => copyLink(deck)}
                    data-testid={`copy-link-${deck.id}`}
                    className="rounded-md border border-[color:var(--border)] px-3 py-2 text-xs font-medium hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                  >
                    {copiedId === deck.id ? "Copied!" : "Copy link"}
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <a
                    href={`/d/${deck.shareToken}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md bg-[color:var(--foreground)] text-[color:var(--background)] px-3 py-1.5 font-medium no-underline hover:opacity-80"
                  >
                    Open student view ↗
                  </a>
                  <a
                    href={`/d/${deck.shareToken}/pdf`}
                    className="rounded-md border border-[color:var(--border)] px-3 py-1.5 font-medium no-underline text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                  >
                    ⬇ PDF study guide
                  </a>
                  <a
                    href={`/d/${deck.shareToken}/anki`}
                    className="rounded-md border border-[color:var(--border)] px-3 py-1.5 font-medium no-underline text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                  >
                    ⬇ Anki deck
                  </a>
                  <a
                    href={`mailto:?subject=${encodeURIComponent(
                      `Study deck: ${deck.title}`,
                    )}&body=${encodeURIComponent(
                      `Here's a flashcard deck to study:\n\n${shareUrl(deck.shareToken)}\n\nOpen it in your browser to study, or download it for Anki.`,
                    )}`}
                    className="rounded-md border border-[color:var(--border)] px-3 py-1.5 font-medium no-underline text-[color:var(--foreground)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                  >
                    ✉ Email to students
                  </a>
                  <button
                    type="button"
                    onClick={() => removeDeck(deck)}
                    disabled={deletingId === deck.id}
                    data-testid={`delete-deck-${deck.id}`}
                    className="ml-auto rounded-md px-3 py-1.5 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === deck.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
