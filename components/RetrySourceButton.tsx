"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RetrySourceButton({ sourceId }: { sourceId: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function retry() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/sources/${sourceId}/retry`, {
          method: "POST",
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || data?.status === "failed") {
          setError(data?.error ?? "Retry failed.");
          // Refresh anyway so the latest error landing in the DB shows up.
          router.refresh();
          return;
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        data-testid="retry-source"
        className="self-start rounded-md bg-[color:var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Retrying…" : "Retry processing"}
      </button>
      {error && (
        <p className="text-xs text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
