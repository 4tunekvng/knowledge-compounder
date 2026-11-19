"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type FormEvent,
} from "react";
import { Check, FileText, FileUp } from "lucide-react";
import { IndexCard } from "@/components/IndexCard";
import { formatDay } from "@/lib/format";
import { useLocalTime } from "@/lib/use-local-time";
import { useRouter } from "next/navigation";

const PROCESSING_STEPS = [
  "Reading the source",
  "Pulling out the text",
  "Writing why it mattered to you",
  "Drafting flashcards",
  "Naming the main ideas",
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
      className="flex flex-col gap-2 text-ui"
      aria-live="polite"
    >
      {PROCESSING_STEPS.map((s, i) => {
        const done = i < activeIdx;
        const active = i === activeIdx;
        return (
          <li
            key={s}
            className={
              "flex items-center gap-3 " +
              (done || active ? "text-ink" : "text-ink-3")
            }
          >
            <span
              aria-hidden
              className={
                "flex size-5 shrink-0 items-center justify-center rounded-full " +
                (done
                  ? "bg-ink text-stock"
                  : active
                    ? "border border-ink"
                    : "border border-line-strong")
              }
            >
              {done && <Check size={12} strokeWidth={2} />}
            </span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

const todayLabel = () => formatDay(new Date());

export function CaptureForm() {
  const today = useLocalTime(todayLabel);
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
      setError("Paste a link or some text, or add a PDF.");
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
      setError("Only PDF files can be added. Paste other text into the card.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(
        `That PDF is ${(file.size / 1_048_576).toFixed(1)} MB. ` +
          "The limit is 10 MB.",
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
      className="flex flex-col gap-6"
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
      <IndexCard
        head="New capture"
        aside={today}
        className={isDragging ? "outline-2 outline-dashed outline-accent" : ""}
      >
        <textarea
          id="capture-input"
          aria-label="Paste a link or some text, or drop in a PDF"
          data-testid="capture-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste a link or some text"
          rows={6}
          disabled={isPending}
          className={
            "block min-h-[calc(var(--rule-gap)*6)] w-full resize-none " +
            "bg-transparent [field-sizing:content] " +
            "text-ink placeholder:text-ink-3 focus:outline-none " +
            "disabled:opacity-50"
          }
        />
        {isDragging && (
          <div
            className={
              "pointer-events-none absolute inset-0 flex items-center " +
              "justify-center rounded-md bg-stock/90 text-ui text-accent"
            }
          >
            Drop the PDF to capture it
          </div>
        )}
      </IndexCard>

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
        <p
          className="flex items-center gap-2 text-ui text-ink-2"
          data-testid="pdf-name"
        >
          <FileText aria-hidden size={16} strokeWidth={1.5} className="shrink-0" />
          {pdfName}
        </p>
      )}

      {error && (
        <p className="text-ui text-danger" role="alert" data-testid="capture-error">
          {error}
        </p>
      )}

      {isPending ? (
        <ProcessingIndicator />
      ) : (
        <div
          className={
            "flex flex-col-reverse gap-3 sm:flex-row sm:items-center " +
            "sm:justify-between"
          }
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            data-testid="pdf-upload-button"
            className="btn btn-secondary"
          >
            <FileUp aria-hidden size={16} strokeWidth={1.5} /> Add a PDF
          </button>
          <button
            type="submit"
            disabled={input.trim().length === 0}
            data-testid="capture-submit"
            className="btn btn-primary sm:min-w-40"
          >
            Capture
          </button>
        </div>
      )}
    </form>
  );
}
