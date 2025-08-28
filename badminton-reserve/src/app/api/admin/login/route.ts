// src/app/api/admin/login/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "adminToken",
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // 本番は true
    path: "/", // ★重要
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

// ついでにログアウト（削除）も
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: "adminToken",
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
