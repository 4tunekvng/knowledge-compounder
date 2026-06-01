"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";

const PROCESSING_STEPS = [
  "Reading the source",
  "Extracting clean text",
  "Reflecting in your voice",
  "Drafting flashcards",
  "Tagging concepts",
];

const STEP_MS = 1500;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

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
  const [isDragging, setIsDragging] = useState(false);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function handleResult(
    res: Response,
    data: { status?: string; sourceId?: number; error?: string },
  ) {
    if (!res.ok) {
      setError(data.error ?? "Capture failed.");
      return;
    }
    if (data.status === "failed") {
      setError(data.error ?? "Processing failed.");
      if (data.sourceId) router.push(`/sources/${data.sourceId}`);
      router.refresh();
      return;
    }
    setInput("");
    setPdfName(null);
    if (data.sourceId) router.push(`/sources/${data.sourceId}`);
    router.refresh();
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const trimmed = input.trim();
    if (!trimmed) {
      setError("Paste a URL or some text — or drop in a PDF.");
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
        handleResult(res, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  function uploadPdf(file: File) {
    setError(null);
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setError("Only PDF files can be uploaded. Paste other text directly.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(
        `PDF is too large (${(file.size / 1_048_576).toFixed(1)} MB). Max is 10 MB.`,
      );
      return;
    }
    setPdfName(file.name);
    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/capture", { method: "POST", body: formData });
        const data = await res.json();
        handleResult(res, data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error.");
      }
    });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    if (isPending) return;
    const file = event.dataTransfer.files?.[0];
    if (file) uploadPdf(file);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3"
      data-testid="capture-form"
      onDragOver={(e) => {
        e.preventDefault();
        if (!isPending) setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={onDrop}
    >
      <label
        htmlFor="capture-input"
        className="text-sm font-medium text-[color:var(--foreground)]"
      >
        Paste a URL or text, or drop in a PDF. The agent extracts, distills, and adds it to your corpus.
      </label>
      <div
        className="relative rounded-md transition"
        style={
          isDragging
            ? { outline: "2px dashed var(--accent)", outlineOffset: "2px" }
            : undefined
        }
      >
        <textarea
          id="capture-input"
          data-testid="capture-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="https://example.com/an-essay  — or paste passages directly — or drop a PDF onto this box"
          rows={6}
          disabled={isPending}
          className="w-full rounded-md border border-[color:var(--border)] bg-[color:var(--card)] px-4 py-3 text-base font-mono leading-relaxed text-[color:var(--foreground)] placeholder:text-[color:var(--muted)] focus:border-[color:var(--accent)] focus:outline-none disabled:opacity-50"
        />
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-[color:var(--background)]/85 text-sm font-medium text-[color:var(--accent)]">
            Drop the PDF to capture it
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        data-testid="pdf-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadPdf(file);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />

      {pdfName && (
        <p className="text-xs text-[color:var(--muted)]" data-testid="pdf-name">
          📄 {pdfName}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-700" role="alert" data-testid="capture-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        {isPending ? (
          <ProcessingIndicator />
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="pdf-upload-button"
            className="inline-flex items-center gap-2 rounded-md border border-[color:var(--border)] px-4 py-2.5 text-sm font-medium text-[color:var(--foreground)] transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          >
            <span aria-hidden>📄</span> Upload a PDF
          </button>
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
