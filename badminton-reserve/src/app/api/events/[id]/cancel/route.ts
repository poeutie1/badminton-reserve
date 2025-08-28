// src/app/api/events/[id]/cancel/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { pushPromotedMessage } from "@/lib/line";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/* ========= Types & Helpers ========= */

type EventDoc = {
  title?: string;
  date?: unknown; // Firestore Timestamp | Date | string | number | undefined
  time?: string;
  participants?: unknown[]; // string[] 想定
  waitlist?: unknown[]; // string[] 想定
};

type UserDoc = {
  lineUserId?: string | null;
};

type RouteContext = { params: Promise<{ id: string }> };

function hasToDate(x: unknown): x is { toDate: () => Date } {
  return typeof x === "object" && x !== null && "toDate" in (x as object);
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (hasToDate(v)) return v.toDate();
  if (typeof v === "string" || typeof v === "number") return new Date(v);
  return new Date();
}
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

// "line:Uxxxx" → "Uxxxx"、それ以外はそのまま
function normalizeLineTo(s?: string | null): string | null {
  if (!s) return null;
  return s.startsWith("line:") ? s.slice(5) : s;
}

/* ========= Route ========= */

export async function DELETE(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  let promotedUser: string | null = null;
  let title = "";
  let whenLabel = "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const eventUrl = `${baseUrl}/events#${id}`;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");

    const data = snap.data() as EventDoc;

    title = data.title ?? "";
    const date = toDate(data.date);
    const baseWhen = date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    whenLabel = data.time ? `${baseWhen} ${data.time}` : baseWhen;

    let participants = toStringArray(data.participants);
    let waitlist = toStringArray(data.waitlist);

    const wasParticipant = participants.includes(userId);

    // 自分を参加/待機の両方から外す
    participants = participants.filter((p) => p !== userId);
    waitlist = waitlist.filter((p) => p !== userId);

    // 枠が空いていて待機がいれば繰り上げ
    if (wasParticipant && waitlist.length > 0) {
      promotedUser = waitlist[0]!;
      waitlist = waitlist.slice(1);
      if (!participants.includes(promotedUser)) {
        participants.push(promotedUser);
      }
    }

    tx.update(ref, { participants, waitlist });
  });

  // 繰り上げが発生したら通知（アプリ内 & LINE）
  if (promotedUser) {
    // 1) アプリ内通知（未読）を保存
    const note = {
      type: "promotion",
      eventId: id,
      title,
      whenLabel,
      url: eventUrl,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    };
    await db
      .collection("users")
      .doc(promotedUser)
      .collection("notifications")
      .add(note)
      .catch((e) => console.error("notify(save) failed", e));

    // 2) LINEへ push（users.lineUserId が無ければ promotedUser から推測）
    const uSnap = await db.collection("users").doc(promotedUser).get();
    const uData: UserDoc | undefined = uSnap.exists
      ? (uSnap.data() as UserDoc)
      : undefined;

    const to = normalizeLineTo(uData?.lineUserId ?? promotedUser);
    if (to) {
      await pushPromotedMessage({
        to, // "U..." 形式
        title,
        whenLabel,
        eventUrl,
      }).catch((e) => console.error("notify(push) failed", e));
    }
  }

  return NextResponse.json({ ok: true });
}
