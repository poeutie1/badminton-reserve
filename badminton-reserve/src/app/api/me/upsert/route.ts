// src/app/api/me/upsert/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";

export const runtime = "nodejs";

export async function POST() {
  const { userId, displayName, avatarUrl } = await requireUserId();
  const db = getAdminDb();
  await db
    .collection("users")
    .doc(userId)
    .set({ displayName, avatarUrl }, { merge: true });
  return NextResponse.json({ ok: true });
}
