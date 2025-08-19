// src/app/api/events/[id]/cancel/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { pushPromotedMessage } from "@/lib/line";

export const runtime = "nodejs";

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
  let eventUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/events#${id}`;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");
    const data = snap.data() as any;

    title = data.title ?? "";
    const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
    whenLabel = date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    let participants: string[] = data.participants ?? [];
    let waitlist: string[] = data.waitlist ?? [];

    const wasParticipant = participants.includes(userId);
    participants = participants.filter((p) => p !== userId);
    waitlist = waitlist.filter((p) => p !== userId);

    if (wasParticipant && waitlist.length > 0) {
      promotedUser = waitlist[0];
      waitlist = waitlist.slice(1);
      if (!participants.includes(promotedUser!))
        participants.push(promotedUser!);
    }

    tx.update(ref, { participants, waitlist });
  });

  if (promotedUser) {
    const u = await db.collection("users").doc(promotedUser).get();
    const lineUserId: string | undefined = u.data()?.lineUserId;

    if (lineUserId) {
      await pushPromotedMessage({
        to: lineUserId,
        title,
        whenLabel,
        eventUrl,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
