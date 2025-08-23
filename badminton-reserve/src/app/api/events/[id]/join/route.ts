// src/app/api/events/[id]/join/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import * as admin from "firebase-admin"; // ← 型をここから取る

export const runtime = "nodejs";

/* ========= Types & Helpers ========= */

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

  await db.runTransaction(async (tx: admin.firestore.Transaction) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");

    // snap.data() は DocumentData | undefined
    const raw = snap.data();
    const capacity = typeof raw?.capacity === "number" ? raw.capacity : 0;

    const participants = toStringArray(raw?.participants);
    const waitlist = toStringArray(raw?.waitlist);

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
