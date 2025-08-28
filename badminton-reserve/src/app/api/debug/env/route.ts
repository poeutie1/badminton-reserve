// src/app/api/debug/env/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET() {
  const raw = process.env.ADMIN_UIDS ?? "";
  return NextResponse.json({
    ADMIN_UIDS: raw,
    ADMIN_UIDS_split: raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });
}
