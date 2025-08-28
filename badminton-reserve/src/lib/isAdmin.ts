// src/lib/isAdmin.ts
export function isAdminByUid(uid: string | null | undefined): boolean {
  if (!uid) return false;
  const raw = (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const norm = (s: string) => s.replace(/^line:/, ""); // line: 有無を吸収
  const allow = new Set(raw.map(norm));
  return allow.has(norm(String(uid)));
}
