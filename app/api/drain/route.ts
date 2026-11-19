import { NextResponse } from "next/server";
import { CRON_HEADER } from "@/lib/auth/gate";
import { processPendingSources } from "@/lib/services/ingest";

export const runtime = "nodejs";

// Rows per call. The scheduled worker (worker.ts) calls this every 5 minutes
// and a scheduled run may last at most 15 minutes, so 5 rows leaves each
// model call about 3 minutes. That drains 60 rows an hour, so a full
// 200-highlight sync (MAX_PER_SYNC) is processed in under 3.5 hours.
const DRAIN_BATCH = 5;

/**
 * Process stored-but-unprocessed sources, everyone's. Only the cron may call
 * it: its request (lib/scheduled.ts) goes straight to the app with the
 * x-kc-cron header, which the sign-in gate (lib/auth/gate.ts) strips from
 * every request that arrives from outside, signed in or not.
 */
export async function POST(request: Request) {
  if (!request.headers.has(CRON_HEADER)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  try {
    const results = await processPendingSources(DRAIN_BATCH);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("[drain] processPendingSources failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
