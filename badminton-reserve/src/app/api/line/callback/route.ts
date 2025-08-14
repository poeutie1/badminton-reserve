import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs"; // firebase-admin 使うなら必須
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code)
    return NextResponse.redirect(new URL("/profile?e=no_code", req.url));

  // TODO: ここでLINEのトークン交換を実施（省略可）
  // 成功したらセッションID発行（ダミーでOK）
  const sid = crypto.randomUUID();

  // ★ 本番でも届くCookie属性（Domainは付けない！）
  (
    await // ★ 本番でも届くCookie属性（Domainは付けない！）
    cookies()
  ).set("sid", sid, {
    httpOnly: true,
    secure: true, // https なので true
    sameSite: "lax", // リダイレクトでも送られる
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return NextResponse.redirect(new URL("/profile", req.url));
}
