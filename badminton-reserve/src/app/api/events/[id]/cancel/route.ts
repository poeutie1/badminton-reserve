// src/app/api/events/[id]/cancel/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { pushPromotedMessage } from "@/lib/line";
import { FieldValue } from "firebase-admin/firestore"; // ★追加

export const runtime = "nodejs";

// "line:Uxxxx" → "Uxxxx" それ以外はそのまま
function normalizeLineTo(s?: string | null) {
  if (!s) return null;
  return s.startsWith("line:") ? s.slice(5) : s;
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  let promotedUser: string | null = null;
  let title = "";
  let whenLabel = "";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  let eventUrl = `${baseUrl}/events#${id}`;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");
    const data = snap.data() as any;

    title = data.title ?? "";
    const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
    const baseWhen = date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
    whenLabel = data.time ? `${baseWhen} ${data.time}` : baseWhen; // ★timeも表示

    let participants: string[] = data.participants ?? [];
    let waitlist: string[] = data.waitlist ?? [];

    const wasParticipant = participants.includes(userId);
    // 自分を参加/待機の両方から外す
    participants = participants.filter((p) => p !== userId);
    waitlist = waitlist.filter((p) => p !== userId);

    // 枠が空いていて待機がいれば繰り上げ
    if (wasParticipant && waitlist.length > 0) {
      promotedUser = waitlist[0];
      waitlist = waitlist.slice(1);
      if (!participants.includes(promotedUser!)) {
        participants.push(promotedUser!);
      }
    }

    tx.update(ref, { participants, waitlist });
  });

  // ★ 繰り上げが発生したら、通知（アプリ内 & LINE）
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
    const stored = (uSnap.data() as any)?.lineUserId as string | undefined;
    const to = normalizeLineTo(stored ?? promotedUser);
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
