"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** The interest box: plain words in, picks re-ranked on save. */
export function PaperInterests({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await fetch("/api/papers/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interests: text }),
      }).catch(() => null);
      const data = await res?.json().catch(() => null);
      if (!res?.ok) {
        setError(data?.error ?? "Could not save. Check your connection.");
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="interests" className="text-sm font-medium">
        What do you want to read about?
      </label>
      <textarea
        id="interests"
        data-testid="paper-interests"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={
          "One interest per line or comma: reward hacking, world models, " +
          "robot manipulation. Start a line with “not” to leave a topic out."
        }
        className={
          "w-full rounded-md border border-[color:var(--border)] " +
          "bg-[color:var(--card)] p-3 text-sm"
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !text.trim()}
          data-testid="save-interests"
          className={
            "rounded-md bg-[color:var(--accent)] px-4 py-2 text-sm font-medium " +
            "text-[color:var(--background)] disabled:opacity-60"
          }
        >
          {pending
            ? "Finding papers…"
            : initial
              ? "Update my picks"
              : "Find my papers"}
        </button>
        {saved && !pending && (
          <span className="text-sm text-[color:var(--muted)]">Saved.</span>
        )}
        {error && (
          <span role="alert" className="text-sm text-red-700">
            {error}
          </span>
        )}
      </div>
      <p className="text-xs text-[color:var(--muted)]">
        Your interests are yours alone. They are matched against new papers here; no
        one else sees them.
      </p>
    </div>
  );
}
