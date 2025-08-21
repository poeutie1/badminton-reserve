// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

export async function middleware(req: NextRequest) {
  const session = await auth();

  // すでにログイン済みならそのまま
  if (session) return NextResponse.next();

  // 未ログイン → サインインへ（元URLに戻るための callbackUrl を付与）
  const url = new URL("/api/auth/signin", req.url);
  const back = req.nextUrl.pathname + req.nextUrl.search;
  url.searchParams.set("callbackUrl", back);
  return NextResponse.redirect(url);
}

// ログイン必須にしたいパスだけ列挙
export const config = {
  matcher: ["/", "/events/:path*", "/mypage/:path*", "/admin/:path*"],
};
