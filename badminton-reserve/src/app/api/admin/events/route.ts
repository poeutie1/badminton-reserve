export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isAdmin } from "@/lib/admin";

type Body = {
  title?: unknown;
  capacity?: unknown;
  date?: unknown; // "YYYY-MM-DDTHH:mm"
  location?: unknown;
  time?: unknown;
};

export async function POST(req: Request) {
  const session = await auth();
  const u = session?.user;

  // ★ ここで強制
  if (!u || !isAdmin(u.id, u.lineUserId ?? null)) {
    return NextResponse.json({ error: "forbidden" }, { status: u ? 403 : 401 });
  }

  // 入力
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
  const time = typeof b.time === "string" ? b.time.trim() : "";

  if (!title || !dtLocal || Number.isNaN(cap)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // datetime-local はローカル時刻。Date にするとUTCエポックは正しく入るのでそのままでOK
  const date = new Date(dtLocal);

  const db = getAdminDb();
  const ref = await db.collection("events").add({
    title,
    date,
    capacity: cap,
    participants: [],
    waitlist: [],
    createdAt: new Date(),
    createdBy: u.id ?? null,
    ...(location ? { location } : {}),
    ...(time ? { time } : {}),
  });

  return NextResponse.json({ ok: true, id: ref.id }, { status: 201 });
}
