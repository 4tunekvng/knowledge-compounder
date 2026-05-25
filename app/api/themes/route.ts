import { NextResponse } from "next/server";
import { generateThemes } from "@/lib/services/themes";

export const runtime = "nodejs";

export async function POST() {
  try {
    const themes = await generateThemes();
    return NextResponse.json({ themes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    // "Need at least 2 processed sources" and "AI returned themes that referenced no
    // captured sources" are user-actionable states, not server errors.
    if (
      message.startsWith("Need at least") ||
      message.startsWith("AI returned themes")
    ) {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
