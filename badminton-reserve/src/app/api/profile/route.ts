import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { auth } from "@/auth";

export const runtime = "nodejs";

type ProfileBody = {
  nickname?: string;
  level?: string;
  gender?: string;
  message?: string;
  years?: number;
  hometown?: string;
  likes?: string;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as ProfileBody;

  await adminDb
    .collection("users")
    .doc(session.user.uid)
    .set(
      {
        ...body,
        uid: session.user.uid,
        lineUserId: session.user.lineUserId ?? null,
        image: session.user.image ?? null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

  return NextResponse.json({ ok: true });
}
