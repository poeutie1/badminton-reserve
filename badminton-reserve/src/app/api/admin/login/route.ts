// src/app/api/admin/login/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { issueAdminCookie } from "@/lib/adminAuth";
import { timingSafeEqual } from "node:crypto";

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

export async function POST(req: Request) {
  try {
    // 安全に JSON を読み、password を取り出す
    let passwordUnknown: unknown = undefined;
    try {
      const parsed: unknown = await req.json();
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "password" in parsed
      ) {
        passwordUnknown = (parsed as Record<string, unknown>).password;
      }
    } catch {
      // JSON でない/壊れている場合はそのまま進む（passwordUnknown は undefined）
    }

    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      console.error("ADMIN_PASSWORD missing");
      return NextResponse.json(
        { error: "Server misconfigured" },
        { status: 500 }
      );
    }

    if (typeof passwordUnknown !== "string") {
      return NextResponse.json({ error: "Bad Request" }, { status: 400 });
    }

    // 必要なら trim して比較：const ok = safeEqual(passwordUnknown.trim(), expected);
    const ok = safeEqual(passwordUnknown, expected);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await issueAdminCookie(); // 既存実装のまま
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }
}
