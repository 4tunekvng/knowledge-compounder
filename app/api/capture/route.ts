import { NextResponse } from "next/server";
import { ingest, ingestPdf, MAX_PDF_BYTES } from "@/lib/services/ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return handlePdfUpload(request);
  }
  return handleTextCapture(request);
}

async function handleTextCapture(request: Request) {
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

  try {
    const result = await ingest({ raw: input });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "[capture]");
  }
}

async function handlePdfUpload(request: Request) {
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
  try {
    const result = await ingestPdf({ filename, bytes });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "[capture:pdf]");
  }
}

// Shared error → HTTP status mapping for both capture paths.
function errorResponse(err: unknown, tag: string) {
  const message = err instanceof Error ? err.message : "Unknown error.";
  const isUserActionable422 =
    message.startsWith("Failed to extract content") ||
    message.startsWith("Invalid URL") ||
    message.startsWith("Only http") ||
    message.startsWith("Fetching private") ||
    message.startsWith("URL returned non-HTML") ||
    message.startsWith("Response body too large");
  const isBadGateway = message.startsWith("Failed to fetch");
  if (isUserActionable422) {
    return NextResponse.json({ error: message }, { status: 422 });
  }
  if (isBadGateway) {
    return NextResponse.json({ error: message }, { status: 502 });
  }
  console.error(`${tag} ingest failed:`, err);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
