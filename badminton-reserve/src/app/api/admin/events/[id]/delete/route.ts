// src/app/api/admin/events/[id]/delete/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminFromCookie } from "@/lib/adminAuth";
import { isAdminByUid } from "@/lib/isAdmin";
import { auth } from "@/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function doDelete(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;

  // 権限チェック（UID or adminCookie）
  const session = await auth();
  const uid = (session?.user as { id?: string | null } | undefined)?.id ?? null;
  const okUid = isAdminByUid(uid);
  const okCookie = await verifyAdminFromCookie();

  if (!okUid && !okCookie) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  // participants サブコレクション掃除 → 本体削除
  const partSnap = await ref.collection("participants").get();
  const batch = db.batch();
  partSnap.forEach((d) => batch.delete(d.ref));
  batch.delete(ref);
  await batch.commit();

  return NextResponse.json({ ok: true });
}

export async function POST(req: Request, ctx: Ctx) {
  return doDelete(req, ctx);
}
export async function DELETE(req: Request, ctx: Ctx) {
  return doDelete(req, ctx);
}
