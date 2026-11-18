import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { pushPromotedMessage } from "./line";
import type { Promotion } from "./attendance";

export async function notifyPromotions(db: Firestore, eventId: string, event: Record<string, unknown>, promotions: Promotion[]) {
  if (!promotions.length) return;
  const value = event.date;
  const date: Date = value instanceof Date ? value
    : value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function" ? value.toDate()
    : new Date(typeof value === "string" || typeof value === "number" ? value : Date.now());
  const whenLabel = date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  }) + (typeof event.time === "string" ? ` ${event.time}` : "");
  const year = date.toLocaleDateString("en-US", { timeZone: "Asia/Tokyo", year: "numeric" });
  const month = date.toLocaleDateString("en-US", { timeZone: "Asia/Tokyo", month: "numeric" });
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/events/${year}/${month}#${encodeURIComponent(eventId)}`;
  const eventTitle = typeof event.title === "string" ? event.title : "練習";
  for (const person of promotions) {
    if (!person.notifyUserId) continue;
    const title = person.guestName ? `ゲスト「${person.guestName}」が参加に繰り上がりました：${eventTitle}` : eventTitle;
    try {
      const user = db.collection("users").doc(person.notifyUserId);
      await user.collection("notifications").add({
        type: "promotion", eventId, title, whenLabel, whenText: whenLabel, url: eventUrl,
        read: false, isRead: false, createdAt: FieldValue.serverTimestamp(),
        ...(person.guestName ? { guestId: person.id, guestName: person.guestName } : {}),
      });
      const record = (await user.get()).data();
      const to = typeof record?.lineUserId === "string" ? record.lineUserId : person.notifyUserId;
      await pushPromotedMessage({ to, title, whenLabel, eventUrl });
    } catch (error) {
      console.error("notify(promotion) failed", error);
    }
  }
}
