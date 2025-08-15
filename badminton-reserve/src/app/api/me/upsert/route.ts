// src/app/api/me/upsert/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

export async function POST() {
  const { userId, displayName, avatarUrl } = await requireUserId();
  const db = getAdminDb();
  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();

  // 既存のプロフィールがあれば“尊重”して、空欄のときだけ補完
  const cur = snap.exists ? (snap.data() as any) : {};
  const update: Record<string, any> = {
    lastSeenAt: FieldValue.serverTimestamp(),
  };

  if (!cur.displayName || String(cur.displayName).trim() === "") {
    update.displayName = displayName || ""; // ないときだけ埋める
  }
  if (!cur.avatarUrl && avatarUrl) {
    update.avatarUrl = avatarUrl; // ないときだけ埋める
  }

  if (Object.keys(update).length > 1) {
    await ref.set(update, { merge: true });
    return NextResponse.json({ ok: true, updated: true });
  }
  return NextResponse.json({ ok: true, updated: false }); // 既に埋まっている
}
