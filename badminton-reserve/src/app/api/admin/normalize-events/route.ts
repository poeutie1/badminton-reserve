// (例) src/app/api/admin/events/normalize/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

const ADMIN_KEY: string | undefined = process.env.ADMIN_KEY;

function isValidId(x: unknown): x is string {
  return typeof x === "string" && /^[a-z]+:/.test(x.trim());
}

function normalizeList(arr: unknown[] | undefined): string[] {
  const cleaned = (arr ?? [])
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    // よくあるダミー候補を除外
    .filter((s) => !/^dummy[-_ ]?user$/i.test(s))
    .filter((s) => !/^dummy/i.test(s))
    .filter(isValidId);

  return Array.from(new Set(cleaned)); // 重複除去
}

type EventDoc = {
  participants?: unknown[];
  waitlist?: unknown[];
};

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
      const data = d.data() as EventDoc;

      const beforeP = Array.isArray(data.participants)
        ? data.participants.length
        : 0;
      const beforeW = Array.isArray(data.waitlist) ? data.waitlist.length : 0;

      const participants = normalizeList(data.participants);
      const waitlist = normalizeList(data.waitlist);

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
