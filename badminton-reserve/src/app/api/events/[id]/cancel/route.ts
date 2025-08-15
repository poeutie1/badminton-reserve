import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();

  // ★同じくここ
  if (!/^[a-z]+:/.test(userId)) {
    return NextResponse.json(
      { error: "invalid user id shape" },
      { status: 400 }
    );
  }

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");
    const data = snap.data() as any;

    let participants: string[] = data.participants ?? [];
    let waitlist: string[] = data.waitlist ?? [];

    const wasParticipant = participants.includes(userId);
    participants = participants.filter((p) => p !== userId);
    waitlist = waitlist.filter((p) => p !== userId);

    if (wasParticipant && waitlist.length > 0) {
      const nextUser = waitlist[0];
      waitlist = waitlist.slice(1);
      if (!participants.includes(nextUser)) participants.push(nextUser);
    }

    tx.update(ref, { participants, waitlist });
  });

  return NextResponse.json({ ok: true });
}
