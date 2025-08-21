import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { auth } from "@/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserDoc = {
  displayName?: string;
  avatarUrl?: string | null;
  lineUserId?: string | null;
  lastSeenAt?: unknown;
};

const isNonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0;

export async function POST() {
  const session = await auth();
  const user = session?.user;

  const userId = isNonEmpty(user?.id) ? user!.id : undefined;
  const displayName = isNonEmpty(user?.name ?? undefined) ? user!.name! : "";
  const avatarUrl = isNonEmpty(user?.image ?? undefined) ? user!.image! : null;
  const lineUserId = user?.lineUserId ?? null;

  // 未ログインは 401（例外を投げずに返す）
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  try {
    const db = getAdminDb();
    const ref = db.collection("users").doc(userId);
    const snap = await ref.get();
    const cur: Partial<UserDoc> = snap.exists
      ? (snap.data() as UserDoc) ?? {}
      : {};

    const update: Partial<UserDoc> & { lastSeenAt: FieldValue } = {
      lastSeenAt: FieldValue.serverTimestamp(),
    };
    if (!cur.displayName && isNonEmpty(displayName))
      update.displayName = displayName;
    if (!cur.avatarUrl && avatarUrl) update.avatarUrl = avatarUrl;
    if (!cur.lineUserId && lineUserId) update.lineUserId = lineUserId;

    if (Object.keys(update).length > 1) {
      await ref.set(update, { merge: true });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    // e は unknown のまま扱う
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[api/me/upsert] failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
