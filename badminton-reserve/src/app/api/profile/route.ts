import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  // Prefetch 等でGETされても 200 を返す（デバッグ用）
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const sid = (await cookies()).get("sid")?.value;
  if (!sid) {
    return NextResponse.json(
      { ok: false, error: "unauthorized (no sid)" },
      { status: 401 }
    );
  }

  // ここで保存処理（Firestore 等）
  // 例:
  // const body = await req.json();
  // await adminDb.collection("profiles").doc(sid).set(body, { merge: true });

  return NextResponse.json({ ok: true });
}
