import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/user";
import { cancelMember } from "@/lib/attendance";
import { updateEventAttendance } from "@/lib/eventAttendance";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();
  await updateEventAttendance(id, (state, capacity) => ({ promoted: cancelMember(state, userId, capacity) }));
  return NextResponse.json({ ok: true });
}
