// src/app/api/admin/events/[id]/delete/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminFromCookie } from "@/lib/adminAuth";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: RouteCtx) {
  // ✅ params は Promise。必ず await して取り出す
  const { id } = await ctx.params;

  // 管理者チェック（Cookie or UID のどちらかでOK）
  const okCookie = await verifyAdminFromCookie();
  let okUid = false;
  try {
    const session = await auth();
    const u = session?.user as
      | { id?: string | null; lineUserId?: string | null }
      | undefined;
    okUid = !!u && isAdmin(u?.id ?? undefined, u?.lineUserId ?? null);
  } catch {
    okUid = false;
  }
  if (!okCookie && !okUid) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 簡易CSRF（同一オリジンのみ）
  const origin = req.headers.get("origin");
  const self = new URL(req.url).origin;
  if (origin && origin !== self) {
    return NextResponse.json({ error: "bad origin" }, { status: 400 });
  }

  // 削除（サブコレクション participants も掃除）
  const db = getAdminDb();
  const docRef = db.collection("events").doc(id);

  const partSnap = await docRef.collection("participants").get();
  if (!partSnap.empty) {
    const batch = db.batch();
    partSnap.docs.forEach((d: FirebaseFirestore.QueryDocumentSnapshot) =>
      batch.delete(d.ref)
    );
    await batch.commit();
  }

  await docRef.delete();
  return NextResponse.json({ ok: true });
}
