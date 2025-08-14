// src/app/api/profile/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin"; // ←遅延初期化版を使う
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

// 既存の POST はそのまま
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as ProfileBody;
  const adminDb = getAdminDb();

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

// ← 新規追加：保存済みプロフィールを返す
export async function GET() {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminDb = getAdminDb();
  const snap = await adminDb.collection("users").doc(session.user.uid).get();
  return NextResponse.json(snap.exists ? snap.data() : {});
}
