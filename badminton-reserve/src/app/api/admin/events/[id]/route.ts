// src/app/api/admin/events/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { pushPromotedMessage } from "@/lib/line";
import { FieldValue } from "firebase-admin/firestore";

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
type UserDoc = { lineUserId?: string | null };

/* ===== Helpers ===== */
function pickUid(session: SessionLike): string | null {
  const u = session?.user;
  return u?.id ?? u?.uid ?? u?.email ?? u?.name ?? null;
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function hasToDate(x: unknown): x is { toDate: () => Date } {
  return typeof x === "object" && x !== null && "toDate" in (x as object);
}
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (hasToDate(v)) return v.toDate();
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date();
}
function normalizeLineTo(s?: string | null): string | null {
  if (!s) return null;
  return s.startsWith("line:") ? s.slice(5) : s;
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

  const body = await req.json().catch(() => ({}));
  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  const promoted: string[] = [];
  let title = "";
  let whenLabel = "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const eventUrl = `${baseUrl}/events#${id}`;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");
    const data = snap.data() ?? {};

    title = (data.title as string) ?? "";
    const d = toDate(data.date);
    const datePart = d.toLocaleDateString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
    whenLabel = data.time ? `${datePart} ${data.time as string}` : datePart;

    const updates: Record<string, unknown> = {};

    // capacity の更新
    if (typeof body.capacity === "number" && body.capacity >= 0) {
      const newCapacity = body.capacity;
      const participants = toStringArray(data.participants);
      const waitlist = toStringArray(data.waitlist);
      const guestCount = Array.isArray(data.guests) ? data.guests.length : 0;

      // 増枠: 待機リストから繰り上げ
      const currentCount = participants.length + guestCount;
      if (newCapacity > currentCount && waitlist.length > 0) {
        const slotsToFill = newCapacity - currentCount;
        const toPromote = waitlist.splice(0, slotsToFill);
        participants.push(...toPromote);
        promoted.push(...toPromote);
        updates.participants = participants;
        updates.waitlist = waitlist;
      }

      updates.capacity = newCapacity;
    }

    if (Object.keys(updates).length > 0) {
      tx.update(ref, updates);
    }
  });

  // 繰り上げ通知
  for (const userId of promoted) {
    await db
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .add({
        type: "promotion",
        eventId: id,
        title,
        whenLabel,
        whenText: whenLabel,
        url: eventUrl,
        read: false,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch((e) => console.error("notify(promotion/save) failed", e));

    const uSnap = await db.collection("users").doc(userId).get();
    const uData: UserDoc | undefined = uSnap.exists
      ? (uSnap.data() as UserDoc)
      : undefined;
    const to = normalizeLineTo(uData?.lineUserId ?? userId);
    if (to) {
      await pushPromotedMessage({ to, title, whenLabel, eventUrl }).catch(
        (e) => console.error("notify(promotion/push) failed", e)
      );
    }
  }

  return NextResponse.json({ ok: true, promoted: promoted.length });
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
