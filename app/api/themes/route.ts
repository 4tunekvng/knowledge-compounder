import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { errorResponse } from "@/lib/errors";
import { generateThemes } from "@/lib/services/themes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  try {
    const themes = await generateThemes(user.id);
    return NextResponse.json({ themes });
  } catch (err) {
    return errorResponse(err, "[themes] generateThemes");
  }
}
