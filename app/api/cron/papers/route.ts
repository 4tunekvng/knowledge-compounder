import { NextResponse } from "next/server";
import { CRON_HEADER } from "@/lib/auth/gate";
import { harvestIfDue } from "@/lib/papers/harvest";
import { rankActiveMembers } from "@/lib/papers/readers";

export const runtime = "nodejs";

// People ranked per 5-minute run: one index, then ~25-50 ms each (design doc).
const RANK_BATCH = 25;

/**
 * The paper-picks part of the 5-minute cron (lib/scheduled.ts), a request of
 * its own so it never holds up the capture drain. Only the cron may call it:
 * its x-kc-cron header is stripped by the sign-in gate from every outside
 * request. Each stage fails on its own, so a feed outage still ranks people.
 */
export async function POST(request: Request) {
  if (!request.headers.has(CRON_HEADER)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const result: Record<string, unknown> = {};
  let failed = false;
  try {
    result.harvest = await harvestIfDue();
  } catch (err) {
    console.error("[papers-cron] harvest failed:", err);
    failed = true;
  }
  try {
    result.ranked = await rankActiveMembers(Date.now(), RANK_BATCH);
  } catch (err) {
    console.error("[papers-cron] ranking failed:", err);
    failed = true;
  }
  return NextResponse.json(result, { status: failed ? 500 : 200 });
}
