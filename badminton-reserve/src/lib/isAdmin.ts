// src/lib/isAdmin.ts
const norm = (s: string) => s.replace(/^line:/, "");

const adminSet = new Set(
  (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((s) => norm(s.trim()))
    .filter(Boolean)
);

export function isAdminByUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  return adminSet.has(norm(String(uid)));
}
