import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/user";
import { isAdminByUid } from "@/lib/isAdmin";
import { addGuest, removeGuest } from "@/lib/attendance";
import { updateEventAttendance } from "@/lib/eventAttendance";
import type { GuestParticipant } from "@/lib/types";
export const runtime = "nodejs";
type RouteContext = { params: Promise<{ id: string }> };
export async function POST(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();
  if (!isAdminByUid(userId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const input: unknown = await req.json().catch(() => null);
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "名前を入力してください" }, { status: 400 });
  if (body.gender !== undefined && !["男性", "女性", "未回答"].includes(String(body.gender))) {
    return NextResponse.json({ error: "性別が不正です" }, { status: 400 });
  }
  if (body.years !== undefined && (typeof body.years !== "number" || !Number.isFinite(body.years) || body.years < 0)) {
    return NextResponse.json({ error: "経験年数は0以上の数値にしてください" }, { status: 400 });
  }
  const guest: GuestParticipant = {
    id: `guest-${randomUUID()}`, name, addedBy: userId, addedAt: new Date().toISOString(),
    ...(body.gender ? { gender: body.gender as GuestParticipant["gender"] } : {}),
    ...(typeof body.years === "number" ? { years: body.years } : {}),
  };
  const result = await updateEventAttendance(id, (state, capacity) => addGuest(state, guest, capacity));
  return NextResponse.json({ ok: true, guestId: guest.id, status: result.status });
}
export async function DELETE(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();
  if (!isAdminByUid(userId)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const input: unknown = await req.json().catch(() => null);
  const body = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (typeof body.guestId !== "string" || !body.guestId) return NextResponse.json({ error: "guestId is required" }, { status: 400 });
  const guestId = body.guestId;
  const result = await updateEventAttendance(id, (state, capacity) => ({ promoted: removeGuest(state, guestId, capacity) }));
  return NextResponse.json({ ok: true, promoted: result.promoted.map(person => person.id) });
}
