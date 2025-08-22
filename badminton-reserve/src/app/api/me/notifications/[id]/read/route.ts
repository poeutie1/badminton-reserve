// src/app/api/me/notifications/[id]/read/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

// （デバッグ GET を残すなら）ここも await 必須
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  return NextResponse.json({ alive: true, id });
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const { id } = await ctx.params; // ★ ここがポイント

  const db = getAdminDb();
  await db
    .collection("users")
    .doc(userId)
    .collection("notifications")
    .doc(id)
    .set(
      { isRead: true, readAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

  return NextResponse.json({ ok: true });
}
