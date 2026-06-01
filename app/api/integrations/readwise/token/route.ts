import { NextResponse } from "next/server";
import { z } from "zod";
import { setIntegrationToken } from "@/lib/services/ingest-orchestrator";

export const runtime = "nodejs";

const BodySchema = z.object({
  token: z.string().trim().min(8, "Readwise token looks too short."),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid body." },
      { status: 400 },
    );
  }

  try {
    await setIntegrationToken("readwise", parsed.data.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    console.error("[integrations/readwise/token] setIntegrationToken failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
