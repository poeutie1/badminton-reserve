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

  // ★ここ（DB操作の前）に 1 行入れる
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
    const capacity: number = data.capacity ?? 0;
    const participants: string[] = data.participants ?? [];
    const waitlist: string[] = data.waitlist ?? [];

    if (participants.includes(userId) || waitlist.includes(userId)) return;

    if (participants.length < capacity) participants.push(userId);
    else waitlist.push(userId);

    tx.update(ref, { participants, waitlist });
  });

  return NextResponse.json({ ok: true });
}
