import { NextResponse } from "next/server";
import { apiUser, unauthorized } from "@/lib/auth/user";
import { errorResponse } from "@/lib/errors";
import { addMoreCards } from "@/lib/services/cards";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = apiUser(request);
  if (!user) return unauthorized();
  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid source id." }, { status: 400 });
  }
  try {
    const result = await addMoreCards(user.id, id);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err, "[sources/cards] addMoreCards");
  }
}
