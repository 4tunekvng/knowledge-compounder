import { NextResponse } from "next/server";
import { ingest } from "@/lib/services/ingest";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { input?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const input = (body.input ?? "").trim();
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
