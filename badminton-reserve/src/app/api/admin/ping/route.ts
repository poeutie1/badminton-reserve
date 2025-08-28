// src/app/api/admin/ping/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";

export async function GET() {
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const cookieNames = cookieHeader
    .split(";")
    .map((s) => s.split("=")[0].trim())
    .filter(Boolean);

  const adminCookie = (await cookies()).get("adminToken");
  return NextResponse.json({
    admin: adminCookie?.value === "1",
    cookieNames, // ← 何が来てるか一覧
    hasAdminToken: !!adminCookie, // ← adminToken 自体が来てるか
    adminTokenLen: adminCookie?.value?.length ?? 0,
  });
}
