// src/lib/user.ts
import { auth } from "@/auth";

export async function requireUserId() {
  const session = await auth();
  if (!session) throw new Error("Unauthorized");
  const uid = (session.user as any)?.id; // ← ここだけを見る
  if (!uid) throw new Error("No user id");
  return {
    userId: uid,
    displayName: session.user?.name ?? "",
    avatarUrl: (session.user as any)?.image ?? null,
  };
}
