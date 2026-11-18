import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/user";
import { isMemberId, joinMember } from "@/lib/attendance";
import { updateEventAttendance } from "@/lib/eventAttendance";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();
  if (!isMemberId(userId)) return NextResponse.json({ error: "invalid user id shape" }, { status: 400 });
  const result = await updateEventAttendance(id, (state, capacity) => joinMember(state, userId, capacity));
  return NextResponse.json({ ok: true, status: result.status });
}
