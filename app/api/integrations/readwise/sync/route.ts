import { NextResponse } from "next/server";
import { syncIntegration } from "@/lib/services/ingest-orchestrator";
import { InvalidTokenError } from "@/lib/services/ingest-source";

export const runtime = "nodejs";
// A Readwise sync can take a while when a backlog is being processed —
// 200 captures × ~3s/process is ~10 min. Cloudflare Workers cap at 30s by
// default, so the orchestrator's MAX_PER_SYNC=200 plus per-item AI calls
// will need to be tuned downward in prod or the route refactored to a queue.
// For now, single-user dev mode + small backlog → fine.
export const maxDuration = 300;

export async function POST() {
  try {
    const result = await syncIntegration("readwise");
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof InvalidTokenError) {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : "Unknown error.";
    if (message.startsWith("No token configured")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    console.error("[integrations/readwise/sync] syncIntegration failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
