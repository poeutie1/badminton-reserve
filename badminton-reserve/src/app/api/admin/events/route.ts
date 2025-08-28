export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyAdminFromCookie } from "@/lib/adminAuth";
import { auth } from "@/auth";
import { isAdminByUid } from "@/lib/isAdmin";

export async function POST(req: Request) {
  const s = await auth().catch(() => null);
  const uid = (s?.user as { id?: string | null } | undefined)?.id ?? null;

  // 緊急用バイパス（必要なければ消してOK）
  if (process.env.ADMIN_OPEN === "1") {
    // pass
  } else if (!isAdminByUid(uid)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const db = getAdminDb();
  const ref = await db.collection("events").add({
    title: String(body.title ?? ""),
    date: new Date(String(body.date ?? Date.now())),
    capacity: Number(body.capacity ?? 0),
    participants: [],
    waitlist: [],
    createdAt: new Date(),
    createdBy: uid,
    ...(body.location ? { location: String(body.location) } : {}),
    ...(body.time ? { time: String(body.time) } : {}),
  });

  return NextResponse.json({ ok: true, id: ref.id });
}
