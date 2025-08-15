// src/app/api/line/callback/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code)
    return NextResponse.redirect(new URL("/mypage?e=no_code", req.url));

  // TODO: トークン交換（今は省略でOK）
  const sid = crypto.randomUUID(); // 仮セッションID

  // ★ レスポンスを作ってから cookies を set する
  const res = NextResponse.redirect(new URL("/mypage", req.url));

  // ★ localhost(http) では secure=false、本番(https)では true
  const isHttps = url.protocol === "https:";

  res.cookies.set("sid", sid, {
    httpOnly: true,
    secure: isHttps, // ← ここがポイント
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    // Domain は指定しない（付けるとズレやすい）
  });
  return res;
}
