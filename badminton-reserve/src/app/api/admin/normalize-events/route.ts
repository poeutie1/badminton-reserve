// (例) src/app/api/admin/events/normalize/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { readAttendance } from "@/lib/attendance";

export const runtime = "nodejs";

const ADMIN_KEY: string | undefined = process.env.ADMIN_KEY;

type ReportRow = {
  id: string;
  beforeP: number;
  afterP: number;
  beforeW: number;
  afterW: number;
  removed: number;
};

export async function POST(req: Request) {
  if (!ADMIN_KEY) {
    return NextResponse.json({ error: "ADMIN_KEY not set" }, { status: 500 });
  }
  const key = req.headers.get("x-admin-key");
  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const db = getAdminDb();
  const snap = await db.collection("events").get();

  let touched = 0;
  const report: ReportRow[] = [];

  await Promise.all(
    snap.docs.map(async (d) => {
      const row = await db.runTransaction(async tx => {
        const fresh = await tx.get(d.ref);
        const data = fresh.data() ?? {};
        const beforeP = Array.isArray(data.participants) ? data.participants.length : 0;
        const beforeW = Array.isArray(data.waitlist) ? data.waitlist.length : 0;
        const state = readAttendance(data);
        const afterP = state.participants.length;
        const afterW = state.waitlist.length;
        const removed = beforeP + beforeW - afterP - afterW;
        if (removed > 0) tx.update(d.ref, { ...state });
        return { id: d.id, beforeP, afterP, beforeW, afterW, removed };
      });
      if (row.removed > 0) touched++;
      report.push(row);
    })
  );

  return NextResponse.json({ ok: true, touched, report });
}
