// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth"; // ★ v5 のサーバーヘルパー
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function uidFrom(session: any): string {
  // auth.ts の callbacks で token.sub を session.user.id に入れておくと楽
  return session?.user?.id || session?.user?.email || "anonymous";
}

// 読み込み（初期表示）
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({}, { status: 200 });

  const uid = uidFrom(session);
  const db = getAdminDb();
  const snap = await db.collection("profiles").doc(uid).get();
  return NextResponse.json(snap.exists ? snap.data() : {}, { status: 200 });
}

// 保存
export async function POST(req: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const uid = uidFrom(session);
  const body = await req.json();
  const db = getAdminDb();
  await db.collection("profiles").doc(uid).set(body, { merge: true });
  return NextResponse.json({ ok: true });
}
