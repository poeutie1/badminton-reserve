import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { pushLine } from "./line"; // 既出（前に作ったやつ）
import { buildPromotionFlex } from "./line"; // 既出：Flex生成
// "line:Uxxxx" → "Uxxxx"
function toLineUserId(uid: string) {
  return uid.startsWith("line:") ? uid.slice(5) : null;
}

export async function notifyPromotion(args: {
  db: Firestore;
  userId: string; // "line:Uxxx" を想定
  eventId: string;
  title: string;
  date: Date; // JSTで表示用文字列を作る
  time?: string;
}) {
  const { db, userId, eventId, title, date, time } = args;

  const whenBase = date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  const whenText = time ? `${whenBase} ${time}` : whenBase;
  const origin = process.env.NEXT_PUBLIC_BASE_URL ?? "https://example.com";
  const url = `${origin}/events`; // 個別詳細ページがあれば差し替え

  // 1) Firestore に通知レコード（未読）
  await db.collection("users").doc(userId).collection("notifications").add({
    type: "promotion",
    eventId,
    title,
    whenText,
    url,
    createdAt: FieldValue.serverTimestamp(),
    read: false,
  });

  // 2) LINE Push（友だち追加済みかつ line:ID の場合のみ）
  const to = toLineUserId(userId);
  if (to) {
    await pushLine(to, buildPromotionFlex({ title, whenText, url }));
  }
}
