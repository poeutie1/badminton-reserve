// src/app/api/admin/whoami/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isAdminByUid } from "@/lib/isAdmin";

export async function GET() {
  const s = await auth().catch(() => null);
  const u = s?.user as
    | {
        id?: string | null;
        uid?: string | null;
        email?: string | null;
        name?: string | null;
      }
    | undefined;
  const uid = u?.id ?? u?.uid ?? u?.email ?? u?.name ?? null;
  return NextResponse.json({
    uid,
    isAdmin: isAdminByUid(uid),
  });
}
