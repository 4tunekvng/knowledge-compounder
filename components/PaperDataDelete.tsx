"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** "Delete my reading data": interests, clicks and picks, after a confirm. */
export function PaperDataDelete() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    if (
      !window.confirm(
        "Delete your interests, clicks and picks? This can't be undone.",
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/papers/data", { method: "DELETE" }).catch(
        () => null,
      );
      if (!res?.ok) {
        setError("Not deleted. Try again.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        data-testid="delete-reading-data"
        className="btn btn-quiet btn-sm -ml-3"
      >
        {pending ? "Deleting…" : "Delete my reading data"}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-meta text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
