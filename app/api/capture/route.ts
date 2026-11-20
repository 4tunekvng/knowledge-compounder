import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { captureErrorCopy } from "@/lib/error-copy";
import {
  ingest,
  ingestPdf,
  MAX_PDF_BYTES,
  type Filed,
  type IngestResult,
} from "@/lib/services/ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  const contentType = request.headers.get("content-type") ?? "";
  // ?progress=1: answer as a stream of JSON lines, one per real stage, so
  // the page can say the capture is saved while its notes are written.
  const progress = new URL(request.url).searchParams.get("progress") === "1";
  if (contentType.includes("multipart/form-data")) {
    return handlePdfUpload(request, user.id, progress);
  }
  return handleTextCapture(request, user.id, progress);
}

type Run = (onFiled: (filed: Filed) => void) => Promise<IngestResult>;

async function respond(run: Run, progress: boolean, tag: string, kind: Kind) {
  if (!progress) {
    try {
      return NextResponse.json(await run(() => {}));
    } catch (err) {
      const failure = describeFailure(err, tag, kind);
      return NextResponse.json(
        { error: failure.error },
        { status: failure.status },
      );
    }
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await run((filed) => send({ stage: "filed", ...filed }));
        send({ stage: "done", ...result });
      } catch (err) {
        send({ stage: "error", ...describeFailure(err, tag, kind) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function handleTextCapture(
  request: Request,
  ownerId: string,
  progress: boolean,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const raw = (body as Record<string, unknown>).input;
  if (raw !== undefined && typeof raw !== "string") {
    return NextResponse.json({ error: "input must be a string." }, { status: 400 });
  }
  const input = (typeof raw === "string" ? raw : "").trim();
  if (input.length === 0) {
    return NextResponse.json({ error: "Capture cannot be empty." }, { status: 400 });
  }
  if (input.length > 100_000) {
    return NextResponse.json(
      { error: "Capture is too large (max 100KB). Trim it down first." },
      { status: 400 },
    );
  }

  return respond(
    (onFiled) => ingest({ ownerId, raw: input, onFiled }),
    progress,
    "[capture]",
    "url",
  );
}

async function handlePdfUpload(
  request: Request,
  ownerId: string,
  progress: boolean,
) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No PDF file uploaded (expected a `file` field)." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      {
        error: `PDF is too large (${(file.size / 1_048_576).toFixed(1)} MB). Max is ${
          MAX_PDF_BYTES / 1_048_576
        } MB.`,
      },
      { status: 413 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // Magic-number check: a real PDF starts with "%PDF-". Cheaper and more
  // reliable than trusting the client-sent content-type / filename.
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  if (header !== "%PDF-") {
    return NextResponse.json(
      { error: "That doesn't look like a PDF file." },
      { status: 415 },
    );
  }

  const filename = file.name && file.name.trim() ? file.name : "upload.pdf";
  return respond(
    (onFiled) => ingestPdf({ ownerId, filename, bytes, onFiled }),
    progress,
    "[capture:pdf]",
    "pdf",
  );
}

type Kind = "url" | "pdf";

// Shared error → HTTP status and plain message for both capture paths.
function describeFailure(
  err: unknown,
  tag: string,
  kind: Kind,
): { status: number; error: string } {
  const message = err instanceof Error ? err.message : "Unknown error.";
  const isUserActionable422 =
    message.startsWith("Failed to extract content") ||
    message.startsWith("Invalid URL") ||
    message.startsWith("Only http") ||
    message.startsWith("Fetching private") ||
    message.startsWith("URL returned non-HTML") ||
    message.startsWith("Response body too large");
  const isBadGateway = message.startsWith("Failed to fetch");
  // The status still follows the raw text; the reader gets plain copy.
  if (isUserActionable422) {
    return { status: 422, error: captureErrorCopy(message, kind) };
  }
  if (isBadGateway) {
    return { status: 502, error: captureErrorCopy(message, kind) };
  }
  console.error(`${tag} ingest failed:`, err);
  return {
    status: 500,
    error: "Something went wrong saving that. Try again in a moment.",
  };
}
