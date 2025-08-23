// middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "adminToken";

// これを追加
const PUBLIC_PATHS = new Set<string>([
  "/admin/login", // ← ログインページは除外
  // ここに他の公開ページがあれば追加
]);

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // すでに公開扱いなら何もしない
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  // ルートが管理領域か？
  const isAdminPage = pathname.startsWith("/admin/");
  const isAdminApi = pathname.startsWith("/api/admin/");

  // /api/admin/login と /api/admin/logout は通す
  if (
    isAdminApi &&
    (pathname === "/api/admin/login" || pathname === "/api/admin/logout")
  ) {
    return NextResponse.next();
  }

  if (!(isAdminPage || isAdminApi)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    const url = new URL("/admin/login", req.url);
    // next には「元の保護ページ」だけを入れる（login自身は入れない）
    if (!PUBLIC_PATHS.has(pathname)) url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload?.adm === true) return NextResponse.next();
  } catch {
    /* ignore */
  }

  const url = new URL("/admin/login", req.url);
  if (!PUBLIC_PATHS.has(pathname)) url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
