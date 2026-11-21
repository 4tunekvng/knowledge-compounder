"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

/**
 * The month's deep read: one click files the paper in the library and makes
 * it a deck, then offers the deck's study page and Anki download.
 */
export function PaperDeepRead({
  arxivId,
  title,
  summary,
  matched,
}: {
  arxivId: string;
  title: string;
  summary: string;
  matched: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ sourceId: number; shareToken: string } | null>(
    null,
  );

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/papers/deep-read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ arxivId }),
      }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!res?.ok || !data?.shareToken) {
        setError(data?.error ?? "Not saved. Try again.");
        return;
      }
      setMade(data);
    });
  }

  return (
    <section className="panel flex flex-col gap-3 p-6" data-testid="deep-read">
      <h2 className="section-title">Your deep read this month</h2>
      <p className="text-meta text-ink-3">
        The best paper you met in the last 30 days, worth a slow read and a deck of
        cards.
      </p>
      <h3 className="font-serif text-lead">
        <a
          href={`https://arxiv.org/abs/${arxivId}`}
          target="_blank"
          rel="noreferrer"
        >
          {title}
        </a>
      </h3>
      <p className="text-ui text-ink-2">{summary}</p>
      <p className="text-meta text-ink-3">Why: {matched.join(", ")}</p>
      {made ? (
        <p
          className="text-meta text-ink-2"
          role="status"
          data-testid="deep-read-made"
        >
          In your library; its flashcards arrive within a few minutes.{" "}
          <Link href={`/sources/${made.sourceId}`}>Open the paper</Link> ·{" "}
          <Link href={`/d/${made.shareToken}`}>Study deck</Link> ·{" "}
          <a href={`/d/${made.shareToken}/anki`}>Anki download</a>
        </p>
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={start}
            data-testid="start-deep-read"
          >
            {pending ? "Saving…" : "Deep-read it: save and make an Anki deck"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
