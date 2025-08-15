// src/app/api/profile/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/auth"; // ルートに置いた auth.ts から

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const uid = (session.user as any).id ?? session.user?.email ?? "anonymous";
  return NextResponse.json({});
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  // await adminDb.collection("profiles").doc((session.user as any).id).set(body, { merge: true });
  return NextResponse.json({ ok: true });
}
