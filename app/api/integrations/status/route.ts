import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { listIntegrationStatus } from "@/lib/services/ingest-orchestrator";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  try {
    const providers = await listIntegrationStatus(user.id);
    return NextResponse.json({ providers });
  } catch (err) {
    console.error("[integrations/status] listIntegrationStatus failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
