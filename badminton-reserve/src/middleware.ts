// middleware.ts
import { NextResponse } from "next/server";

export function middleware(req: Request) {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/admin/")) {
    return NextResponse.next(); // ★ APIは通す（ここ重要）
  }
  return NextResponse.next(); // ページ保護は必要ならここで
}

export const config = {
  matcher: ["/admin/:path*"], // ★APIパスは含めない
};
