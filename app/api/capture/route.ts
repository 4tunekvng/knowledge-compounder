import { NextResponse } from "next/server";
import { ingest } from "@/lib/services/ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    return NextResponse.json(
      { error: "Capture cannot be empty." },
      { status: 400 },
    );
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
    const message = err instanceof Error ? err.message : "Unknown error.";
    // Surface user-actionable messages (extraction/URL failures) but mask
    // internal DB / infra errors to avoid leaking schema or path details.
    const isUserActionable =
      message.startsWith("Capture is empty") ||
      message.startsWith("Failed to extract content") ||
      message.startsWith("Invalid URL") ||
      message.startsWith("Only http") ||
      message.startsWith("Fetching private") ||
      message.startsWith("URL returned non-HTML") ||
      message.startsWith("Response body too large") ||
      message.startsWith("Failed to fetch");
    const safe = isUserActionable ? message : "Internal server error.";
    console.error("[capture] ingest failed:", err);
    return NextResponse.json({ error: safe }, { status: 500 });
  }
}
