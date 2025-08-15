import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const ADMIN_KEY = process.env.ADMIN_KEY;

function isValidId(x: any): x is string {
  return typeof x === "string" && /^[a-z]+:/.test(x.trim());
}

function normalizeList(arr: any[]): string[] {
  const cleaned = (arr ?? [])
    .filter((x) => typeof x === "string")
    .map((s: string) => s.trim())
    .filter((s) => s.length > 0)
    // よくあるダミー候補を除外
    .filter((s) => !/^dummy[-_ ]?user$/i.test(s))
    .filter((s) => !/^dummy/i.test(s))
    .filter(isValidId);

  // 重複除去
  return Array.from(new Set(cleaned));
}

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
  const report: Array<{
    id: string;
    beforeP: number;
    afterP: number;
    beforeW: number;
    afterW: number;
    removed: number;
  }> = [];

  await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as any;
      const beforeP = Array.isArray(data.participants)
        ? data.participants.length
        : 0;
      const beforeW = Array.isArray(data.waitlist) ? data.waitlist.length : 0;

      const participants = normalizeList(data.participants ?? []);
      const waitlist = normalizeList(data.waitlist ?? []);

      // 参加者と待機者に同じIDがいたら、参加者を優先
      const pSet = new Set(participants);
      const fixedWaitlist = waitlist.filter((id) => !pSet.has(id));

      const afterP = participants.length;
      const afterW = fixedWaitlist.length;
      const removed = beforeP + beforeW - afterP - afterW;

      if (removed > 0) {
        await d.ref.update({ participants, waitlist: fixedWaitlist });
        touched++;
      }

      report.push({ id: d.id, beforeP, afterP, beforeW, afterW, removed });
    })
  );

  return NextResponse.json({ ok: true, touched, report });
}
