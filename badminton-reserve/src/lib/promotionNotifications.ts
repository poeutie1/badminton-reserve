import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { pushPromotedMessage } from "./line";
import type { Promotion } from "./attendance";

function eventDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate();
  }
  return new Date(typeof value === "string" || typeof value === "number" ? value : Date.now());
}

export async function notifyPromotions(
  db: Firestore,
  eventId: string,
  event: Record<string, unknown>,
  promotions: Promotion[],
) {
  const date = eventDate(event.date);
  const whenLabel = `${date.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  })}${typeof event.time === "string" ? ` ${event.time}` : ""}`;
  const year = date.toLocaleDateString("en-US", { timeZone: "Asia/Tokyo", year: "numeric" });
  const month = date.toLocaleDateString("en-US", { timeZone: "Asia/Tokyo", month: "numeric" });
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/events/${year}/${month}#${encodeURIComponent(eventId)}`;
  const eventTitle = typeof event.title === "string" ? event.title : "練習";

  for (const promotion of promotions) {
    if (!promotion.notifyUserId) continue;
    const title = promotion.kind === "guest"
      ? `ゲスト「${promotion.name}」が参加に繰り上がりました：${eventTitle}` : eventTitle;
    try {
      await db.collection("users").doc(promotion.notifyUserId).collection("notifications").add({
        type: "promotion", eventId, title, whenLabel, whenText: whenLabel,
        url: eventUrl, read: false, isRead: false,
        ...(promotion.kind === "guest" ? { guestId: promotion.id, guestName: promotion.name } : {}),
        createdAt: FieldValue.serverTimestamp(),
      });
      const user = await db.collection("users").doc(promotion.notifyUserId).get();
      const to = typeof user.data()?.lineUserId === "string"
        ? user.data()!.lineUserId as string : promotion.notifyUserId;
      await pushPromotedMessage({ to, title, whenLabel, eventUrl,
        ...(promotion.kind === "guest" ? { guestName: promotion.name } : {}) });
    } catch (error) {
      console.error("notify(promotion) failed", error);
    }
  }
}
