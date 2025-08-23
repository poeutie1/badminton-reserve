// src/app/api/admin/events/create/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isAdmin } from "@/lib/admin";

type Body = {
  title?: unknown;
  capacity?: unknown;
  date?: unknown; // "YYYY-MM-DDTHH:mm"（開始）
  location?: unknown;
  endTime?: unknown; // "HH:mm"（任意・同日想定）
  durMin?: unknown; // 数字（任意・終了までの分）
};

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user;
  if (!u || !isAdmin(u.id, u.lineUserId ?? null)) {
    return NextResponse.json({ error: "forbidden" }, { status: u ? 403 : 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const b = raw as Body;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  const cap =
    typeof b.capacity === "number"
      ? b.capacity
      : Number.isFinite(Number(b.capacity))
      ? Number(b.capacity)
      : NaN;
  const dtLocal = typeof b.date === "string" ? b.date.trim() : "";
  const location = typeof b.location === "string" ? b.location.trim() : "";

  if (!title || !dtLocal || Number.isNaN(cap)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // 開始（ローカルの datetime-local をそのまま Date に）
  const start = new Date(dtLocal);

  const db = getAdminDb();
  const ref = await db.collection("events").add({
    title,
    // 互換のため両方保存
    date: start, // 既存コード用
    capacity: cap,
    participants: [],
    waitlist: [],
    createdAt: new Date(),
    createdBy: u.id ?? null,
    ...(location ? { location, place: location } : {}),
  });

  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}
