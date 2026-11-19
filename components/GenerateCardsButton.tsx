"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { countLabel } from "@/lib/format";

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
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={generate}
        disabled={pending}
        data-testid="generate-more-cards"
        className="btn btn-secondary"
      >
        <Plus aria-hidden size={16} strokeWidth={1.5} />
        {pending ? "Writing cards…" : "Generate more cards"}
      </button>
      {added !== null && added > 0 && (
        <p className="text-meta text-ok" data-testid="cards-added" role="status">
          Added {countLabel(added, "new card")}
        </p>
      )}
      {error && (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
