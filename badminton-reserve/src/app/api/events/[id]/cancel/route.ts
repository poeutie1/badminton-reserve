import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { auth } from "@/auth";

export const runtime = "nodejs";

type EventDoc = {
  title?: string;
  participants?: string[];
  waitlist?: string[];
};
type UserDoc = { lineUserId?: string | null };

async function notifyPromoted(lineUserId: string, title: string) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !lineUserId) return;
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [
        {
          type: "text",
          text: `「${title}」のキャンセル待ちが繰り上がり、参加確定になりました！`,
        },
      ],
    }),
  }).catch(() => {});
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params; // ← await が必須
  const uid = session.user.uid;
  const eventRef = adminDb.collection("events").doc(id);

  let promotedUserLineId: string | null = null;
  let eventTitle = "";

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) throw new Error("not_found");

    const data = snap.data() as EventDoc;
    eventTitle = data.title ?? "練習会";

    const before = data.participants ?? [];
    const participants = before.filter((x) => x !== uid);
    const waitlist = data.waitlist ?? [];

    if (participants.length < before.length && waitlist.length > 0) {
      const [promoted, ...rest] = waitlist; // ← prefer-const 回避
      participants.push(promoted);

      const userDoc = await tx.get(adminDb.collection("users").doc(promoted));
      const u = userDoc.data() as UserDoc | undefined;
      if (u?.lineUserId) promotedUserLineId = u.lineUserId;

      tx.update(eventRef, { participants, waitlist: rest });
    } else {
      tx.update(eventRef, { participants, waitlist });
    }
  });

  if (promotedUserLineId) await notifyPromoted(promotedUserLineId, eventTitle);
  return NextResponse.json({ ok: true });
}
