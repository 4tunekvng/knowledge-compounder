import { NextResponse } from "next/server";
import { listIntegrationStatus } from "@/lib/services/ingest-orchestrator";

export const runtime = "nodejs";

export async function GET() {
  try {
    const providers = await listIntegrationStatus();
    return NextResponse.json({ providers });
  } catch (err) {
    console.error("[integrations/status] listIntegrationStatus failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
