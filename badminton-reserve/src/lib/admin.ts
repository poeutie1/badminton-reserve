// 環境変数 ADMIN_UIDS="line:Uaaaa, line:Ubbbb" のように設定
const parse = (s?: string) =>
  (s ?? "")
    .split(/[,\s]+/) // カンマ/改行/空白どれでもOK
    .map((v) => v.trim())
    .filter(Boolean);

const ADMIN_SET = new Set(parse(process.env.ADMIN_UIDS));

export function isAdmin(userId?: string, lineUserId?: string | null): boolean {
  // userId には "line:Uxxx" が入る想定（auth.ts）
  if (userId && ADMIN_SET.has(userId)) return true;
  // raw の LINE userId にも対応（"line:" を付与して照合）
  if (lineUserId && ADMIN_SET.has(`line:${lineUserId}`)) return true;
  return false;
}
