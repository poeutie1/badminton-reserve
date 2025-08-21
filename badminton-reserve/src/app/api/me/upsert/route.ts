// src/app/api/me/upsert/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { FieldValue } from "firebase-admin/firestore";
import { auth } from "@/auth";

export const runtime = "nodejs";

type SessionUser = { lineUserId?: string | null } | null;
type SessionLike = { user?: SessionUser } | null;

type UserDoc = {
  displayName?: string;
  avatarUrl?: string | null;
  lineUserId?: string | null;
  lastSeenAt?: unknown;
};

export async function POST() {
  const { userId, displayName, avatarUrl } = await requireUserId();
  const session = (await auth()) as SessionLike;
  const lineUserId: string | null = session?.user?.lineUserId ?? null;

  const db = getAdminDb();
  const ref = db.collection("users").doc(userId);
  const snap = await ref.get();
  const cur: Partial<UserDoc> = snap.exists
    ? (snap.data() as UserDoc) ?? {}
    : {};

  const update: Partial<UserDoc> & { lastSeenAt: FieldValue } = {
    lastSeenAt: FieldValue.serverTimestamp(),
  };
  if (!cur.displayName) update.displayName = displayName || "";
  if (!cur.avatarUrl && avatarUrl) update.avatarUrl = avatarUrl;
  if (!cur.lineUserId && lineUserId) update.lineUserId = lineUserId;

  // lastSeenAt 以外に何か更新がある場合のみ書き込む
  if (Object.keys(update).length > 1) {
    await ref.set(update, { merge: true });
  }

  return NextResponse.json({ ok: true });
}
