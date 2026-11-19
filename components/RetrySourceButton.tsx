"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RetrySourceButton({
  sourceId,
  small = false,
}: {
  sourceId: number;
  // The library row's version: a smaller button that sits above the row's
  // whole-row link.
  small?: boolean;
}) {
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
    <div
      className={
        "flex flex-col gap-2 " + (small ? "relative z-10 mt-3" : "mt-4")
      }
    >
      <button
        type="button"
        onClick={retry}
        disabled={pending}
        data-testid="retry-source"
        className={"btn btn-secondary self-start " + (small ? "btn-sm" : "")}
      >
        {pending ? "Trying again…" : "Try again"}
      </button>
      {error && (
        <p className="text-meta text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
