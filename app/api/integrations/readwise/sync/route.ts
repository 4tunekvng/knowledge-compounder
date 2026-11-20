import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { errorResponse } from "@/lib/errors";
import { syncIntegration } from "@/lib/services/ingest-orchestrator";

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
    return errorResponse(err, "[integrations/readwise/sync] syncIntegration");
  }
}
