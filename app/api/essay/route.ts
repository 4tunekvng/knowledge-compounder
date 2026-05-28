import { NextResponse } from "next/server";
import { draftEssayForTheme } from "@/lib/services/themes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { themeId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const themeId = Number(body.themeId);
  if (!Number.isInteger(themeId) || themeId <= 0) {
    return NextResponse.json({ error: "Invalid themeId." }, { status: 400 });
  }

  try {
    const essay = await draftEssayForTheme(themeId);
    return NextResponse.json({ essay });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    if (message === "Theme not found.") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.startsWith("Theme has fewer than")) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    console.error("[essay] draftEssayForTheme failed:", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
