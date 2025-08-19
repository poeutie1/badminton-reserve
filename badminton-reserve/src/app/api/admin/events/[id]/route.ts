// src/app/api/admin/events/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function pickUid(session: any) {
  return (
    session?.user?.id || // v5 推奨
    (session?.user as any)?.uid || // 互換
    session?.user?.email || // メールログインならこれ
    session?.user?.name || // 最後の保険
    null
  );
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const session = await auth();
  const uid = pickUid(session);

  const allowByUid =
    !!uid && (ADMIN_UIDS.length === 0 || ADMIN_UIDS.includes(String(uid)));

  if (!allowByUid) {
    return NextResponse.json(
      {
        error: "forbidden",
        debug: {
          signedIn: !!session,
          uid,
          ADMIN_UIDS_count: ADMIN_UIDS.length,
        },
      },
      { status: session ? 403 : 401 }
    );
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // 必要なら「作成者のみ削除可」にするならここで snap.data().createdBy === uid をチェック

  await ref.delete();
  return NextResponse.json({ ok: true });
}
