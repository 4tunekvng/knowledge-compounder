"use client";

import {
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type FormEvent,
} from "react";
import { FileText, FileUp } from "lucide-react";
import { IndexCard } from "@/components/IndexCard";
import { displayTitle, formatDay } from "@/lib/format";
import { useLocalTime } from "@/lib/use-local-time";
import { useRouter } from "next/navigation";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const todayLabel = () => formatDay(new Date());

export function CaptureForm({
  onFiling,
}: {
  // Told what is being filed when a capture starts, and null when it ends.
  onFiling?: (title: string | null) => void;
}) {
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

    send(displayTitle(trimmed.split("\n")[0], 80), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: trimmed }),
    });
  }

  // Posts a capture and shows it being filed until the answer comes back.
  function send(title: string, init: RequestInit) {
    // Outside the transition, so the filing card shows while it runs.
    onFiling?.(title);
    startTransition(async () => {
      try {
        const res = await fetch("/api/capture", init);
        const data = await res.json();
        handleResult(res, data);
      } catch {
        setError("Couldn't reach the app. Check your connection and try again.");
      } finally {
        onFiling?.(null);
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
    const formData = new FormData();
    formData.append("file", file);
    send(file.name, { method: "POST", body: formData });
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

      <div
        className={
          "flex flex-col-reverse gap-3 sm:flex-row sm:items-center " +
          "sm:justify-between"
        }
      >
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          data-testid="pdf-upload-button"
          className="btn btn-secondary"
        >
          <FileUp aria-hidden size={16} strokeWidth={1.5} /> Add a PDF
        </button>
        <button
          type="submit"
          disabled={isPending || input.trim().length === 0}
          data-testid="capture-submit"
          className="btn btn-primary sm:min-w-40"
        >
          {isPending ? "Filing…" : "Capture"}
        </button>
      </div>
    </form>
  );
}
