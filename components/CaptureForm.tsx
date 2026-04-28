"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PROCESSING_STEPS = [
  "Fetching the source",
  "Extracting clean text",
  "Reflecting in your voice",
  "Drafting three flashcards",
  "Tagging concepts",
];

const STEP_MS = 1500;

function ProcessingIndicator() {
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const idx = Math.min(
        PROCESSING_STEPS.length - 1,
        Math.floor((now - start) / STEP_MS),
      );
      setActiveIdx(idx);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <ol
      data-testid="capture-processing"
      className="flex flex-col gap-1.5 text-sm"
      aria-live="polite"
    >
      {PROCESSING_STEPS.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <li
            key={s}
            className="flex items-center gap-2.5 transition-opacity"
            style={{ opacity: i > activeIdx ? 0.4 : 1 }}
          >
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
              style={{
                background: done
                  ? "color-mix(in srgb, var(--accent) 22%, transparent)"
                  : active
                    ? "color-mix(in srgb, var(--accent) 38%, transparent)"
                    : "color-mix(in srgb, var(--muted) 18%, transparent)",
                color: done || active ? "var(--accent)" : "var(--muted)",
              }}
            >
              {done ? "✓" : active ? "•" : i + 1}
            </span>
            <span
              style={{
                color: done || active ? "var(--foreground)" : "var(--muted)",
              }}
            >
              {s}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function CaptureForm() {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmed = input.trim();
    if (!trimmed) {
      setError("Paste a URL or some text first.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/capture", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: trimmed }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Capture failed.");
          return;
        }
        if (data.status === "failed") {
          setError(data.error ?? "Processing failed.");
          // Still navigate to the source so the user sees the failure record.
          router.push(`/sources/${data.sourceId}`);
          router.refresh();
          return;
        }
        setInput("");
        router.push(`/sources/${data.sourceId}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      data-testid="capture-form"
    >
      <label
        htmlFor="capture-input"
        className="text-sm font-medium text-[color:var(--foreground)]"
      >
        Paste a URL or text. The agent will extract, distill, and add it to your corpus.
      </label>
      <textarea
        id="capture-input"
        data-testid="capture-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="https://example.com/an-essay  — or just paste passages directly"
        rows={6}
        disabled={isPending}
        className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-base font-mono leading-relaxed text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:outline-none disabled:opacity-50"
      />
      {error && (
        <p
          className="text-sm text-red-700"
          role="alert"
          data-testid="capture-error"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {isPending ? (
          <ProcessingIndicator />
        ) : (
          <p className="text-xs text-[color:var(--muted)]">
            Processing takes a few seconds. You&apos;ll be redirected to the captured item.
          </p>
        )}
        <button
          type="submit"
          disabled={isPending || input.trim().length === 0}
          data-testid="capture-submit"
          className="rounded-md bg-[color:var(--accent)] px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
        >
          {isPending ? "Processing…" : "Capture"}
        </button>
      </div>
    </form>
  );
}
