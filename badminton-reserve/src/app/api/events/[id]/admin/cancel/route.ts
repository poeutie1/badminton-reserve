// src/app/api/events/[id]/admin/cancel/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { FieldValue } from "firebase-admin/firestore";
import { pushPromotedMessage } from "@/lib/line";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ========= Config / Types ========= */
const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type UserDoc = {
  lineUserId?: string | null;
};

function isAdmin(uid?: string | null) {
  return !!uid && ADMIN_UIDS.includes(uid);
}

/* ========= Utils ========= */
function hasToDate(x: unknown): x is { toDate: () => Date } {
  return typeof x === "object" && x !== null && "toDate" in (x as object);
}
function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (hasToDate(v)) return v.toDate();
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date();
}
function toStrArr(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}
// "line:Uxxxx" → "Uxxxx"
function normalizeLineTo(s?: string | null): string | null {
  if (!s) return null;
  return s.startsWith("line:") ? s.slice(5) : s;
}
// /api/events/[id]/admin/cancel から id を抜く（ctx を使わない）
function getEventIdFromRequest(req: Request): string | null {
  try {
    const pathname = new URL(req.url).pathname;
    const m = pathname.match(/\/api\/events\/([^/]+)\/admin\/cancel\/?$/);
    return m ? decodeURIComponent(m[1]!) : null;
  } catch {
    return null;
  }
}

/* ========= Core ========= */
async function handleAdminCancel(eventId: string, req: Request) {
  // 権限
  const { userId: me } = await requireUserId();
  if (!isAdmin(me)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 入力（unknown から安全に取り出す）
  let target = "";
  let promote = true;
  let notify = true;
  let reason: string | undefined;
  try {
    const raw = (await req.json()) as unknown;
    if (typeof raw === "object" && raw !== null) {
      const o = raw as Record<string, unknown>;
      if (typeof o.userId === "string") target = o.userId.trim();
      if (typeof o.promote === "boolean") promote = o.promote;
      if (typeof o.notify === "boolean") notify = o.notify;
      if (typeof o.reason === "string") reason = o.reason;
    }
  } catch {
    /* no body → 既定値のまま */
  }
  if (!target) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(eventId);

  // 通知用
  let title = "";
  let whenLabel = "";
  let promotedUser: string | null = null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const eventUrl = `${baseUrl}/events#${eventId}`;

  // 更新（競合対策でトランザクション）
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");

    const data = snap.data() ?? {};
    title = (data.title as string) ?? "";
    const d = toDate(data.date);
    const baseWhen = d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    whenLabel = data.time ? `${baseWhen} ${data.time as string}` : baseWhen;

    let participants = toStrArr(data.participants);
    let waitlist = toStrArr(data.waitlist);

    const wasParticipant = participants.includes(target);

    // 対象を除外
    participants = participants.filter((u) => u !== target);
    waitlist = waitlist.filter((u) => u !== target);

    // 繰上げ
    if (promote && wasParticipant && waitlist.length > 0) {
      promotedUser = waitlist.shift()!;
      if (!participants.includes(promotedUser)) {
        participants.push(promotedUser);
      }
    }

    tx.update(ref, { participants, waitlist });
  });

  // 通知
  if (notify) {
    // 外された本人
    await db
      .collection("users")
      .doc(target)
      .collection("notifications")
      .add({
        type: "admin-cancelled",
        eventId,
        title,
        whenLabel,
        whenText: whenLabel, // 互換
        url: eventUrl,
        reason: reason ?? null,
        read: false,
        isRead: false, // 互換
        createdAt: FieldValue.serverTimestamp(),
      })
      .catch((e) => console.error("notify(admin-cancelled) failed", e));

    // 繰上げがあれば
    if (promotedUser) {
      await db
        .collection("users")
        .doc(promotedUser)
        .collection("notifications")
        .add({
          type: "promotion",
          eventId,
          title,
          whenLabel,
          whenText: whenLabel,
          url: eventUrl,
          read: false,
          isRead: false,
          createdAt: FieldValue.serverTimestamp(),
        })
        .catch((e) => console.error("notify(promotion/save) failed", e));

      const uSnap = await db.collection("users").doc(promotedUser).get();
      const uData =
        (uSnap.exists ? (uSnap.data() as UserDoc) : undefined) || {};
      const to = normalizeLineTo(uData.lineUserId ?? promotedUser);
      if (to) {
        await pushPromotedMessage({ to, title, whenLabel, eventUrl }).catch(
          (e) => console.error("notify(promotion/push) failed", e)
        );
      }
    }
  }

  return NextResponse.json({ ok: true, promotedUser });
}

/* ========= Route Handlers (ctx なし) ========= */
export async function POST(req: Request) {
  const id = getEventIdFromRequest(req);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  return handleAdminCancel(id, req);
}

export async function DELETE(req: Request) {
  const id = getEventIdFromRequest(req);
  if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  return handleAdminCancel(id, req);
}
