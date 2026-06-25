// src/app/api/events/[id]/guests/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { isAdminByUid } from "@/lib/isAdmin";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

type GuestInput = {
  name?: string;
  gender?: string;
  years?: number;
};

type GuestDoc = {
  id: string;
  name: string;
  gender?: string;
  years?: number;
  addedBy: string;
  addedAt: string;
};

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function toGuestArray(v: unknown): GuestDoc[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (x): x is GuestDoc =>
      typeof x === "object" && x !== null && typeof x.id === "string"
  );
}

/* POST: ゲスト追加 */
export async function POST(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();

  if (!isAdminByUid(userId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as GuestInput;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "name is required" },
      { status: 400 }
    );
  }

  const guestId = `guest-${Date.now()}`;
  const guest: GuestDoc = {
    id: guestId,
    name,
    ...(body.gender ? { gender: String(body.gender) } : {}),
    ...(typeof body.years === "number" ? { years: body.years } : {}),
    addedBy: userId,
    addedAt: new Date().toISOString(),
  };

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  let capacityFull = false;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");
    const data = snap.data() ?? {};

    const capacity = typeof data.capacity === "number" ? data.capacity : 0;
    const participants = toStringArray(data.participants);
    const guests = toGuestArray(data.guests);
    const currentCount = participants.length + guests.length;

    if (currentCount >= capacity) {
      capacityFull = true;
      return;
    }

    guests.push(guest);
    tx.update(ref, { guests });
  });

  if (capacityFull) {
    return NextResponse.json(
      { error: "定員に達しています", full: true },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true, guestId });
}

/* DELETE: ゲスト削除 */
export async function DELETE(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();

  if (!isAdminByUid(userId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { guestId?: string };
  const guestId = typeof body.guestId === "string" ? body.guestId : "";
  if (!guestId) {
    return NextResponse.json(
      { error: "guestId is required" },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  let promotedUser: string | null = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");
    const data = snap.data() ?? {};

    const capacity = typeof data.capacity === "number" ? data.capacity : 0;
    const participants = toStringArray(data.participants);
    const waitlist = toStringArray(data.waitlist);
    let guests = toGuestArray(data.guests);

    const before = guests.length;
    guests = guests.filter((g) => g.id !== guestId);
    if (guests.length === before) return; // not found, no-op

    // ゲスト削除で枠が空いた → waitlistから繰り上げ
    const newCount = participants.length + guests.length;
    if (newCount < capacity && waitlist.length > 0) {
      promotedUser = waitlist.shift()!;
      if (!participants.includes(promotedUser)) {
        participants.push(promotedUser);
      }
      tx.update(ref, { guests, participants, waitlist });
    } else {
      tx.update(ref, { guests });
    }
  });

  return NextResponse.json({ ok: true, promoted: promotedUser });
}
