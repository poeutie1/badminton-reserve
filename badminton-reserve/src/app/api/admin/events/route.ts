// src/app/api/admin/events/route.ts
export const runtime = "nodejs"; // Admin SDK を使うので nodejs 固定

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminDb } from "@/lib/firebaseAdmin";

/* ===== Admin gate ===== */
const ADMIN_UIDS: string[] = (process.env.ADMIN_UIDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ADMIN_KEY: string = (process.env.ADMIN_KEY ?? "").trim(); // 旧x-admin-key方式も併用可

/* ===== Types ===== */
type SessionUser = {
  id?: string;
  uid?: string;
  email?: string | null;
  name?: string | null;
};
type SessionLike = { user?: SessionUser | null } | null;

type EventCreateBody = {
  title?: unknown;
  capacity?: unknown;
  date?: unknown; // "YYYY-MM-DDTHH:mm"（<input type="datetime-local">想定）
  location?: unknown; // optional
  time?: unknown; // optional (e.g. "19:00-21:00")
};

type EventPayload = {
  title: string;
  date: Date;
  capacity: number;
  participants: string[];
  waitlist: string[];
  createdAt: Date;
  createdBy: string | null;
  location?: string;
  time?: string;
};

/* ===== Helpers ===== */
function pickUid(session: SessionLike): string | null {
  const u = session?.user;
  return u?.id ?? u?.uid ?? u?.email ?? u?.name ?? null;
}

function parseBody(json: unknown): EventCreateBody {
  if (typeof json !== "object" || json === null) return {};
  return json as EventCreateBody;
}

export async function POST(req: Request) {
  const session = (await auth()) as SessionLike;
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
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const body = parseBody(raw);

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const capacity =
    typeof body.capacity === "number"
      ? body.capacity
      : Number.isFinite(Number(body.capacity))
      ? Number(body.capacity)
      : NaN;
  const dtLocal = typeof body.date === "string" ? body.date.trim() : "";

  const location =
    typeof body.location === "string" ? body.location.trim() : "";
  const time = typeof body.time === "string" ? body.time.trim() : "";

  if (!title || !dtLocal || Number.isNaN(capacity)) {
    return NextResponse.json(
      {
        error: "bad request",
        debug: { title, dtLocal, capacity: body.capacity },
      },
      { status: 400 }
    );
  }

  // ---- ローカル日時 → UTC補正して保存（Firestore Timestampに適したDate）----
  // <input type="datetime-local"> はタイムゾーン情報を含まない → ローカル時刻として解釈される
  const local = new Date(dtLocal); // local time
  const date = new Date(local.getTime() - local.getTimezoneOffset() * 60000); // UTCに揃える

  // ---- Firestore へ保存：未入力は入れない（undefined を避ける）----
  const payload: EventPayload = {
    title,
    date,
    capacity,
    participants: [],
    waitlist: [],
    createdAt: new Date(),
    createdBy: uid,
    ...(location ? { location } : {}),
    ...(time ? { time } : {}),
  };

  const db = getAdminDb();
  const doc = await db.collection("events").add(payload);

  return NextResponse.json({ ok: true, id: doc.id });
}
