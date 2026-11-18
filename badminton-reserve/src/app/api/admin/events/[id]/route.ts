// src/app/api/admin/events/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { promoteWaitlist } from "@/lib/attendance";
import { updateEventAttendance } from "@/lib/eventAttendance";

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

async function assertAdmin(session: SessionLike): Promise<string | null> {
  const uid = pickUid(session);
  if (!uid) return null;
  if (ADMIN_UIDS.length === 0 || ADMIN_UIDS.includes(String(uid))) return uid;
  return null;
}

/* ===== PATCH: イベント更新（capacity等） ===== */
export async function PATCH(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const session = (await auth()) as SessionLike;
  const uid = await assertAdmin(session);
  if (!uid) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({})) as { capacity?: unknown };
  if (typeof body.capacity !== "number" || !Number.isInteger(body.capacity) || body.capacity < 0) {
    return NextResponse.json({ error: "定員は0以上の整数にしてください" }, { status: 400 });
  }
  const capacity = body.capacity;
  const result = await updateEventAttendance(id, state => ({
    promoted: promoteWaitlist(state, capacity), updates: { capacity },
  }));
  return NextResponse.json({ ok: true, promoted: result.promoted.length });
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
