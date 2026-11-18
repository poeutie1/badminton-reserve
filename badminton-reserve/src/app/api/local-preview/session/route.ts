import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isLocalPreviewRequest } from "@/lib/localPreview";
import { isAdminByUid } from "@/lib/isAdmin";
import { clearAdminCookie, issueAdminCookie } from "@/lib/adminAuth";

export async function POST(request: Request) {
  if (!isLocalPreviewRequest(request)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isAdminByUid(session.user.id)) await issueAdminCookie();
  else await clearAdminCookie();
  return NextResponse.json({ ok: true });
}
