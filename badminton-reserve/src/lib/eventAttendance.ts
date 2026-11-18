import { getAdminDb } from "./firebaseAdmin";
import { readAttendance, type Attendance, type Promotion } from "./attendance";
import { notifyPromotions } from "./promotionNotifications";

export async function updateEventAttendance<T extends { promoted: Promotion[]; updates?: Record<string, unknown> }>(
  eventId: string,
  change: (state: Attendance, capacity: number, event: Record<string, unknown>) => T,
  notify = true,
) {
  const db = getAdminDb();
  const ref = db.collection("events").doc(eventId);
  const result = await db.runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new Error("event not found");
    const event = snapshot.data()!;
    const state = readAttendance(event);
    const outcome = change(state, typeof event.capacity === "number" ? event.capacity : 0, event);
    tx.update(ref, { ...state, ...outcome.updates });
    return { outcome, event };
  });
  if (notify) await notifyPromotions(db, eventId, result.event, result.outcome.promoted);
  return result.outcome;
}
