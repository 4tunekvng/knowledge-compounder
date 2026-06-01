"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function GenerateCardsButton({ sourceId }: { sourceId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  function generate() {
    setError(null);
    setAdded(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sources/${sourceId}/cards`, {
          method: "POST",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error ?? "Failed to generate cards.");
          return;
        }
        setAdded(data?.added ?? 0);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        data-testid="generate-more-cards"
        className="rounded-md border border-[color:var(--border)] px-3 py-1.5 text-xs font-medium text-[color:var(--foreground)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Generating…" : "+ Generate more cards"}
      </button>
      {added !== null && added > 0 && (
        <p className="text-xs text-[color:var(--accent)]" data-testid="cards-added">
          Added {added} new {added === 1 ? "card" : "cards"}.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
