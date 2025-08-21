// src/app/events/page.tsx
import { getAdminDb } from "@/lib/firebaseAdmin";
import { auth } from "@/auth";
import JoinCancelButtons from "./_components/JoinCancelButtons";
import ParticipantsLine from "./_components/ParticipantsLine";
import PromotionBanner, { type Note } from "./_components/PromotionBanner";
import WaitlistLine from "./_components/WaitlistLine";
import { FieldValue, type WriteResult } from "firebase-admin/firestore";
import DeleteEventButton from "./_components/DeleteEventButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ========= Types ========= */
type UserProfile = {
  displayName?: string;
  preferredName?: string;
  nickname?: string;
  name?: string;
  avatarUrl?: string | null;
};

type EventRow = {
  id: string;
  title: string;
  date: Date;
  capacity: number;
  participants: string[];
  waitlist: string[];
  location?: string;
  time?: string;
  joined: boolean;
  inWaitlist: boolean;
  full: boolean;
  participantProfiles: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  }>;
  waitlistProfiles: Array<{
    id: string;
    name: string;
    avatarUrl?: string | null;
  }>;
};

type EventDoc = {
  title?: string;
  date?: unknown;
  capacity?: number;
  participants?: unknown[];
  waitlist?: unknown[];
  location?: string;
  time?: string;
};

type ProfileDoc = UserProfile;

/* ========= Utilities ========= */

function normalizeIds(arr: unknown[] | undefined): string[] {
  const cleaned = (arr ?? [])
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !/^dummy[-_ ]?user$/i.test(s))
    .filter((s) => !/^dummy/i.test(s))
    .filter((s) => /^[a-z]+:/.test(s));
  return Array.from(new Set(cleaned));
}

function maskId(id: string) {
  if (id.includes("@")) {
    const [u, d] = id.split("@");
    return `${u.slice(0, Math.min(3, u.length))}${
      u.length > 3 ? "…" : ""
    }@${d}`;
  }
  return id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-2)}` : id;
}

type Nameish = Partial<
  Pick<UserProfile, "displayName" | "preferredName" | "nickname" | "name">
>;

function pickName(u?: Nameish): string | undefined {
  if (!u) return undefined;
  return u.displayName ?? u.preferredName ?? u.nickname ?? u.name ?? undefined;
}

function hasToDate(x: unknown): x is { toDate: () => Date } {
  if (typeof x !== "object" || x === null) return false;
  const maybe = x as { toDate?: unknown };
  return typeof maybe.toDate === "function";
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (hasToDate(v)) return v.toDate();
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") return new Date(v);
  // フォールバック：今
  return new Date();
}

/* ========= Page ========= */

export default async function EventsPage() {
  const session = await auth();
  const su = session?.user as
    | { id?: string; uid?: string; email?: string; name?: string }
    | undefined;

  const userId: string | null =
    su?.id ?? su?.uid ?? su?.email ?? su?.name ?? null;

  const ADMIN_UIDS: string[] = (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const isAdmin =
    !!userId &&
    (ADMIN_UIDS.length === 0 || ADMIN_UIDS.includes(String(userId)));

  const db = getAdminDb();
  const snap = await db.collection("events").orderBy("date").get();

  /* --- 1) セルフヒーリング --- */
  const toFix: Promise<WriteResult>[] = [];
  const base = snap.docs.map((d) => {
    const data = d.data() as EventDoc;

    const rawParticipants = Array.isArray(data.participants)
      ? data.participants
      : [];
    const rawWaitlist = Array.isArray(data.waitlist) ? data.waitlist : [];

    const p = normalizeIds(rawParticipants);
    const w0 = normalizeIds(rawWaitlist);
    const w = w0.filter((id) => !p.includes(id));

    if (
      p.length !== rawParticipants.length ||
      w.length !== rawWaitlist.length
    ) {
      toFix.push(
        d.ref.update({
          participants: p,
          waitlist: w,
          normalizedAt: FieldValue.serverTimestamp(),
        })
      );
    }

    const date = toDate(data.date);
    const capacity = typeof data.capacity === "number" ? data.capacity : 0;

    return {
      id: d.id,
      title: data.title ?? "",
      date,
      capacity,
      participants: p,
      waitlist: w,
      location: data.location,
      time: data.time,
      joined:
        Boolean(userId) &&
        (p.includes(String(userId)) || w.includes(String(userId))),
      inWaitlist: Boolean(userId) && w.includes(String(userId)),
      full: p.length >= capacity,
    };
  });
  // 非同期の修復は待たない
  Promise.allSettled(toFix).catch(() => {});

  /* --- 2) プロフィール解決 --- */
  const allIds = Array.from(
    new Set(base.flatMap((e) => [...e.participants, ...e.waitlist]))
  );

  const profilesMap = new Map<string, ProfileDoc>();
  if (allIds.length) {
    const profileRefs = allIds.map((id) => db.collection("profiles").doc(id));
    const profileSnaps = await db.getAll(...profileRefs);
    profileSnaps.forEach((s) => {
      profilesMap.set(s.id, s.exists ? (s.data() as ProfileDoc) : {});
    });
  }

  const usersMap = new Map<string, UserProfile>();
  if (allIds.length) {
    const userRefs = allIds.map((id) => db.collection("users").doc(id));
    const userSnaps = await db.getAll(...userRefs);
    userSnaps.forEach((s) => {
      usersMap.set(s.id, s.exists ? (s.data() as UserProfile) : {});
    });
  }

  const events: EventRow[] = base.map((e) => ({
    ...e,
    participantProfiles: e.participants.map((id) => {
      const fromProfile = profilesMap.get(id);
      const fromUser = usersMap.get(id);
      return {
        id,
        name: pickName(fromProfile) ?? pickName(fromUser) ?? maskId(id),
        avatarUrl: fromProfile?.avatarUrl ?? fromUser?.avatarUrl ?? null,
      };
    }),
    waitlistProfiles: e.waitlist.map((id) => {
      const fromProfile = profilesMap.get(id);
      const fromUser = usersMap.get(id);
      return {
        id,
        name: pickName(fromProfile) ?? pickName(fromUser) ?? maskId(id),
        avatarUrl: fromProfile?.avatarUrl ?? fromUser?.avatarUrl ?? null,
      };
    }),
  }));

  /* --- 2.5) 未読通知を取得 --- */
  let notes: Note[] = [];
  if (userId) {
    const snapN = await db
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .where("read", "==", false)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    notes = snapN.docs.map((d): Note => {
      const x = d.data() as Partial<Note>;
      return {
        id: d.id,
        title: x.title ?? "",
        whenText: x.whenText ?? "",
        url: x.url ?? "/events",
      };
    });
  }

  /* --- 3) 描画 --- */
  return (
    <div className="space-y-3 p-4">
      {/* 未読通知バナー */}
      <PromotionBanner notes={notes} />

      {events.map((ev) => {
        const filled = `${ev.participants.length}/${ev.capacity}`;
        const when = ev.date.toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        });

        return (
          <div key={ev.id} className="rounded-xl bg-white p-4 shadow">
            <div className="font-semibold">{ev.title}</div>

            <div className="mt-1 flex items-center justify-between text-sm text-gray-500">
              <div>
                {when}
                {ev.time ? `・${ev.time}` : ""}・{filled}
              </div>
              {isAdmin && (
                <DeleteEventButton id={ev.id} title={ev.title} compact />
              )}
            </div>

            {ev.location && (
              <div className="text-sm text-gray-500">📍 {ev.location}</div>
            )}

            <ParticipantsLine
              people={ev.participantProfiles}
              me={userId ?? undefined}
            />

            {ev.waitlistProfiles.length > 0 && (
              <WaitlistLine
                people={ev.waitlistProfiles}
                me={userId ?? undefined}
              />
            )}

            <div className="mt-2">
              <JoinCancelButtons
                id={ev.id}
                joined={ev.joined}
                inWaitlist={ev.inWaitlist}
                full={ev.full}
                disabled={!userId}
              />
              {!userId && (
                <div className="mt-1 text-xs text-red-500">
                  ログインすると参加できます
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
