import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { syncIntegration } from "@/lib/services/ingest-orchestrator";
import { InvalidTokenError } from "@/lib/services/ingest-source";

export const runtime = "nodejs";
// Sync only fetches highlights and stores them as pending rows; the cron
// drain (worker.ts → /api/drain) does the AI work, so this request never
// waits on Claude.

export async function POST(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  try {
    const result = await syncIntegration(user.id, "readwise");
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
