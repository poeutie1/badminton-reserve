// src/app/api/events/[id]/cancel/route.ts
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireUserId } from "@/lib/user";
import { pushPromotedMessage } from "@/lib/line";

export const runtime = "nodejs";

/* ===== Types & helpers ===== */

type EventDoc = {
  title?: string;
  date?: unknown; // Firestore Timestamp | Date | string | number
  participants?: unknown[];
  waitlist?: unknown[];
};

function hasToDate(x: unknown): x is { toDate: () => Date } {
  return typeof x === "object" && x !== null && "toDate" in (x as object);
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (hasToDate(value)) return value.toDate();
  if (typeof value === "string" || typeof value === "number")
    return new Date(value);
  return new Date();
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { userId } = await requireUserId();

  const db = getAdminDb();
  const ref = db.collection("events").doc(id);

  let promotedUser: string | null = null;
  let title = "";
  let whenLabel = "";
  const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/events#${id}`;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("not found");

    const data = snap.data() as EventDoc;

    title = data.title ?? "";
    const date = toDate(data.date);
    whenLabel = date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

    let participants = toStringArray(data.participants);
    let waitlist = toStringArray(data.waitlist);

    const wasParticipant = participants.includes(userId);
    participants = participants.filter((p) => p !== userId);
    waitlist = waitlist.filter((p) => p !== userId);

    if (wasParticipant && waitlist.length > 0) {
      promotedUser = waitlist[0]!;
      waitlist = waitlist.slice(1);
      if (!participants.includes(promotedUser)) {
        participants.push(promotedUser);
      }
    }

    tx.update(ref, { participants, waitlist });
  });

  if (promotedUser) {
    const u = await db.collection("users").doc(promotedUser).get();
    const ud =
      (u.exists ? (u.data() as Record<string, unknown>) : undefined) ??
      undefined;
    const lineUserId =
      typeof ud?.lineUserId === "string"
        ? (ud.lineUserId as string)
        : undefined;

    if (lineUserId) {
      await pushPromotedMessage({
        to: lineUserId,
        title,
        whenLabel,
        eventUrl,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
