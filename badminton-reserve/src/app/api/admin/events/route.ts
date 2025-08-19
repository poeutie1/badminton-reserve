// src/app/api/admin/events/route.ts
export const runtime = "nodejs"; // Admin SDK を使うので nodejs 固定

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_KEY = (process.env.ADMIN_KEY ?? "").trim(); // 旧x-admin-key方式も併用可

function pickUid(session: any) {
  return (
    session?.user?.id || // v5 推奨
    (session?.user as any)?.uid || // 互換
    session?.user?.email || // メールログインならこれ
    session?.user?.name || // 最後の保険
    null
  );
}

export async function POST(req: Request) {
  const session = await auth();
  const uid = pickUid(session);
  const headerKey = req.headers.get("x-admin-key")?.trim();

  const allowByUid =
    !!uid && (ADMIN_UIDS.length === 0 || ADMIN_UIDS.includes(String(uid)));
  const allowByKey = !!ADMIN_KEY && ADMIN_KEY === (headerKey ?? "");

  if (!allowByUid && !allowByKey) {
    return NextResponse.json(
      {
        error: "forbidden",
        debug: {
          signedIn: !!session,
          uid,
          allowByUid,
          allowByKey,
          ADMIN_UIDS_count: ADMIN_UIDS.length,
        },
      },
      { status: session ? 403 : 401 }
    );
  }

  // ---- 入力の読み取り＆検証 ----
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const capacity = Number(body.capacity);
  const dtLocal = String(body.date ?? "").trim(); // "YYYY-MM-DDTHH:mm"（datetime-local想定）
  const locationRaw = body.location != null ? String(body.location) : "";
  const timeRaw = body.time != null ? String(body.time) : "";

  if (!title || !dtLocal || Number.isNaN(capacity)) {
    return NextResponse.json(
      {
        error: "bad request",
        debug: { title, dtLocal, capacity: body.capacity },
      },
      { status: 400 }
    );
  }

  // ---- ローカル日時 → UTC補正して保存（Firestore Timestamp）----
  const local = new Date(dtLocal);
  const date = new Date(local.getTime() - local.getTimezoneOffset() * 60000);

  // ---- Firestore へ保存：未入力は入れない（undefined を避ける）----
  const payload: Record<string, any> = {
    title,
    date,
    capacity,
    participants: [],
    waitlist: [],
    createdAt: new Date(),
    createdBy: uid,
  };

  const location = locationRaw.trim();
  if (location) payload.location = location;

  const time = timeRaw.trim();
  if (time) payload.time = time;

  const db = getAdminDb();
  const doc = await db.collection("events").add(payload);

  return NextResponse.json({ ok: true, id: doc.id });
}
