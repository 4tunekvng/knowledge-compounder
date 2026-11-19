import { NextResponse } from "next/server";
import { processPendingSources } from "@/lib/services/ingest";

export const runtime = "nodejs";

// Rows per call. The scheduled worker (worker.ts) calls this every 5 minutes
// and a scheduled run may last at most 15 minutes, so 5 rows leaves each
// model call about 3 minutes. That drains 60 rows an hour, so a full
// 200-highlight sync (MAX_PER_SYNC) is processed in under 3.5 hours.
const DRAIN_BATCH = 5;

/**
 * Process stored-but-unprocessed sources. Behind the site's KC_API_SECRET
 * check (middleware.ts) like every other route; the worker's cron handler
 * sends the secret as a bearer token.
 */
export async function POST() {
  try {
    const results = await processPendingSources(DRAIN_BATCH);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[drain] processPendingSources failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
