import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";
import { auth } from "@/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminEmails = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const adminUids = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAdmin =
    (session.user.email && adminEmails.includes(session.user.email)) ||
    (session.user.uid && adminUids.includes(session.user.uid));

  if (!isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    title: string;
    date: string;
    capacity: number;
  };
  const ref = await adminDb.collection("events").add({
    title: body.title,
    date: body.date,
    capacity: Number(body.capacity) || 0,
    participants: [] as string[],
    waitlist: [] as string[],
    createdBy: session.user.uid,
    status: "open" as const,
    createdAt: Date.now(),
  });

  return NextResponse.json({ id: ref.id });
}
