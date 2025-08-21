// src/app/api/events/[id]/join/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";

export const runtime = "nodejs";

/* ========= Types & Helpers ========= */

type EventDoc = {
  capacity?: number;
  participants?: unknown[]; // string[] 想定
  waitlist?: unknown[]; // string[] 想定
};

type RouteContext = { params: Promise<{ id: string }> };

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

/* ========= Route ========= */

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();

  // ユーザーIDのフォーマット簡易チェック
  if (!/^[a-z]+:/.test(userId)) {
    return NextResponse.json(
      { error: "invalid user id shape" },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");

    const data = snap.data() as EventDoc;
    const capacity = typeof data.capacity === "number" ? data.capacity : 0;

    const participants = toStringArray(data.participants);
    const waitlist = toStringArray(data.waitlist);

    // すでにどちらかにいるなら何もしない
    if (participants.includes(userId) || waitlist.includes(userId)) return;

    if (participants.length < capacity) {
      participants.push(userId);
    } else {
      waitlist.push(userId);
    }

    tx.update(ref, { participants, waitlist });
  });

  return NextResponse.json({ ok: true });
}
