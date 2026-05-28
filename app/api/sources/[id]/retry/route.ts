import { NextResponse } from "next/server";
import { retrySource } from "@/lib/services/ingest";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid source id." }, { status: 400 });
  }
  try {
    const result = await retrySource(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    if (message === "Source not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("Source is not in a failed state")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    console.error("[sources/retry] retrySource failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
