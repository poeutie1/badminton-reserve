import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  const uid =
    (session?.user as any)?.id || // v5 推奨
    (session?.user as any)?.uid || // 互換
    session?.user?.email || // メールログインならこれ
    session?.user?.name ||
    null;

  return NextResponse.json({
    signedIn: !!session,
    uid,
    adminCheckKey: process.env.ADMIN_UIDS ?? "",
  });
}
