import { auth } from "@/auth";

type SessionUserLite = {
  id?: string | null;
  name?: string | null;
  image?: string | null;
};

export async function requireUserId() {
  const session = await auth();
  const u = (session?.user ?? {}) as SessionUserLite;
  if (!u.id) throw new Error("Unauthorized");
  return {
    userId: u.id,
    displayName: u.name ?? "",
    avatarUrl: u.image ?? null,
  };
}
