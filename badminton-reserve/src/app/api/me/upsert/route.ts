// src/app/api/me/upsert/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { FieldValue } from "firebase-admin/firestore";
import { auth } from "@/auth";

export const runtime = "nodejs";

export async function POST() {
  const { userId, displayName, avatarUrl } = await requireUserId();
  const session = await auth();
  const lineUserId = (session?.user as any)?.lineUserId ?? null;

  const db = getAdminDb();
  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  const cur = snap.exists ? (snap.data() as any) : {};

  const update: Record<string, any> = {
    lastSeenAt: FieldValue.serverTimestamp(),
  };
  if (!cur.displayName) update.displayName = displayName || "";
  if (!cur.avatarUrl && avatarUrl) update.avatarUrl = avatarUrl;
  if (!cur.lineUserId && lineUserId) update.lineUserId = lineUserId;

  if (Object.keys(update).length > 1) await ref.set(update, { merge: true });
  return NextResponse.json({ ok: true });
}
