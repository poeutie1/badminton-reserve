// src/app/api/admin/debug/set/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "adminToken",
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // 本番は true
    path: "/", // ★重要：/ にする
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
