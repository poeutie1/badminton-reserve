// src/app/api/admin/events/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

/* ===== Admin gate ===== */
const ADMIN_UIDS: string[] = (process.env.ADMIN_UIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/* ===== Types ===== */
type SessionUser = {
  id?: string;
  uid?: string;
  email?: string | null;
  name?: string | null;
};
type SessionLike = { user?: SessionUser | null } | null;
type RouteContext = { params: Promise<{ id: string }> };

/* ===== Helpers ===== */
function pickUid(session: SessionLike): string | null {
  const u = session?.user;
  return u?.id ?? u?.uid ?? u?.email ?? u?.name ?? null;
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  const session = (await auth()) as SessionLike;
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

  // 作成者制限を付けたい場合はここで:
  // const createdBy = (snap.data() as { createdBy?: string | null })?.createdBy ?? null;
  // if (createdBy && createdBy !== uid) {
  //   return NextResponse.json({ error: "forbidden_owner" }, { status: 403 });
  // }

  await ref.delete();
  return NextResponse.json({ ok: true });
}
