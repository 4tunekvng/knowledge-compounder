import { NextResponse } from "next/server";
import { generateThemes } from "@/lib/services/themes";

export const runtime = "nodejs";

export async function POST() {
  try {
    const themes = await generateThemes();
    return NextResponse.json({ themes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
