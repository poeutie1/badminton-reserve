import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const db = getAdminDb();
  const snap = await db.collection("events").orderBy("date").get();
  const events = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return NextResponse.json(events);
}
