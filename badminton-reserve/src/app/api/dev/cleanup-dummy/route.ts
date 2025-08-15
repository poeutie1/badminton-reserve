import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const db = getAdminDb();
  const snap = await db.collection("events").get();
  let touched = 0;

  await Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data() as any;
      const p: string[] = data.participants ?? [];
      const w: string[] = data.waitlist ?? [];
      const np = p.filter((x) => x !== "dummy-user");
      const nw = w.filter((x) => x !== "dummy-user");
      if (np.length !== p.length || nw.length !== w.length) {
        await d.ref.update({ participants: np, waitlist: nw });
        touched++;
      }
    })
  );

  return NextResponse.json({ ok: true, updatedDocs: touched });
}
