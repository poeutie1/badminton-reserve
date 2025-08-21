// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ===== Types ===== */
type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
};

type SessionLike = {
  user?: SessionUser | null;
} | null;

type ProfileDoc = {
  displayName?: string;
  preferredName?: string;
  nickname?: string;
  name?: string;
  avatarUrl?: string | null;
  // 任意の拡張フィールド
  [k: string]: unknown;
};

/* ===== Helpers ===== */
function uidFrom(session: SessionLike): string {
  const u = session?.user;
  return (u?.id ?? u?.email ?? u?.name ?? "anonymous") as string;
}

/* ===== Routes ===== */

// 読み込み（初期表示）
export async function GET() {
  const session = (await auth()) as SessionLike;
  if (!session) return NextResponse.json({}, { status: 200 });

  const uid = uidFrom(session);
  const db = getAdminDb();
  const snap = await db.collection("profiles").doc(uid).get();

  const data: ProfileDoc = snap.exists ? (snap.data() as ProfileDoc) : {};
  return NextResponse.json(data, { status: 200 });
}

// 保存
export async function POST(req: Request) {
  const session = (await auth()) as SessionLike;
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const uid = uidFrom(session);

  const bodyUnknown: unknown = await req.json();
  if (typeof bodyUnknown !== "object" || bodyUnknown === null) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const body = bodyUnknown as Partial<ProfileDoc>;

  const db = getAdminDb();
  await db.collection("profiles").doc(uid).set(body, { merge: true });

  return NextResponse.json({ ok: true });
}
