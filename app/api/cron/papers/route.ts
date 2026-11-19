import { NextResponse } from "next/server";
import { CRON_HEADER } from "@/lib/auth/gate";
import { harvestIfDue } from "@/lib/papers/harvest";

export const runtime = "nodejs";

/**
 * The paper-picks part of the 5-minute cron (lib/scheduled.ts), a request of
 * its own so it never holds up the capture drain. Only the cron may call it:
 * its x-kc-cron header is stripped by the sign-in gate from every outside
 * request.
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
  return NextResponse.json(result, { status: failed ? 500 : 200 });
}
