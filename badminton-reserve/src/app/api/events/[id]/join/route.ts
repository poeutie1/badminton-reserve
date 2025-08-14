import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { auth } from "@/auth";

export const runtime = "nodejs";

type EventDoc = {
  capacity: number;
  participants?: string[];
  waitlist?: string[];
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params; // ← ここがポイント（await）
  const uid = session.user.uid;

  const eventRef = adminDb.collection("events").doc(id);
  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(eventRef);
    if (!snap.exists) throw new Error("not_found");

    const data = snap.data() as EventDoc;
    const participants = [...(data.participants ?? [])];
    const waitlist = [...(data.waitlist ?? [])];

    if (participants.includes(uid) || waitlist.includes(uid)) return;

    if (participants.length < data.capacity) {
      participants.push(uid);
      tx.update(eventRef, { participants });
    } else {
      waitlist.push(uid);
      tx.update(eventRef, { waitlist });
    }
  });

  return NextResponse.json({ ok: true });
}
