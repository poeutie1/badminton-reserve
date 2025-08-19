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

function normalizeIds(arr: any[]): string[] {
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

function pickName(u?: UserProfile | Record<string, any>) {
  if (!u) return undefined;
  return (
    (u as any).displayName ||
    (u as any).preferredName ||
    (u as any).nickname ||
    (u as any).name ||
    undefined
  );
}

export default async function EventsPage() {
  const session = await auth();
  const userId =
    (session?.user as any)?.id ||
    (session?.user as any)?.uid ||
    session?.user?.email ||
    session?.user?.name ||
    null;

  const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const isAdmin =
    !!userId &&
    (ADMIN_UIDS.length === 0 || ADMIN_UIDS.includes(String(userId)));

  const db = getAdminDb();
  const snap = await db.collection("events").orderBy("date").get();

  // --- 1) セルフヒーリング ---
  const toFix: Promise<WriteResult>[] = [];
  const base = snap.docs.map((d) => {
    const data = d.data() as any;
    const rawParticipants: string[] = data.participants ?? [];
    const rawWaitlist: string[] = data.waitlist ?? [];
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

    const date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
    const capacity = data.capacity ?? 0;

    return {
      id: d.id,
      title: data.title ?? "",
      date,
      capacity,
      participants: p,
      waitlist: w,
      location: data.location,
      time: data.time,
      joined: !!userId && (p.includes(userId) || w.includes(userId)),
      inWaitlist: !!userId && w.includes(userId),
      full: p.length >= capacity,
    };
  });
  Promise.allSettled(toFix).catch(() => {});

  // --- 2) プロフィール解決 ---
  const allIds = Array.from(
    new Set(base.flatMap((e) => [...e.participants, ...e.waitlist]))
  );
  let profilesMap = new Map<string, any>();
  if (allIds.length) {
    const profileRefs = allIds.map((id) => db.collection("profiles").doc(id));
    const profileSnaps = await db.getAll(...profileRefs);
    profilesMap = new Map(
      profileSnaps.map((s) => [s.id, s.exists ? s.data() : {}])
    );
  }
  const userRefs = allIds.map((id) => db.collection("users").doc(id));
  const userSnaps = allIds.length ? await db.getAll(...userRefs) : [];
  const usersMap = new Map<string, UserProfile>();
  userSnaps.forEach((s) =>
    usersMap.set(s.id, s.exists ? (s.data() as UserProfile) : {})
  );

  const events: EventRow[] = base.map((e) => ({
    ...e,
    participantProfiles: e.participants.map((id) => {
      const fromProfile = profilesMap.get(id);
      const fromUser = usersMap.get(id);
      return {
        id,
        name: pickName(fromProfile) || pickName(fromUser) || maskId(id),
        avatarUrl: fromProfile?.avatarUrl ?? fromUser?.avatarUrl ?? null,
      };
    }),
    waitlistProfiles: e.waitlist.map((id) => {
      const fromProfile = profilesMap.get(id);
      const fromUser = usersMap.get(id);
      return {
        id,
        name: pickName(fromProfile) || pickName(fromUser) || maskId(id),
        avatarUrl: fromProfile?.avatarUrl ?? fromUser?.avatarUrl ?? null,
      };
    }),
  }));

  // --- 2.5) 未読通知を取得（ここが移動ポイント） ---
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

    notes = snapN.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        title: x.title ?? "",
        whenText: x.whenText ?? "",
        url: x.url ?? "/events",
      };
    });
  }

  // --- 3) 描画（単一の return に統一） ---
  return (
    <div className="space-y-3 p-4">
      {/* 未読通知バナーを先頭に表示 */}
      <PromotionBanner notes={notes} />

      {events.map((ev) => {
        const filled = `${ev.participants.length}/${ev.capacity}`;
        const when = ev.date.toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        });

        return (
          <div key={ev.id} className="rounded-xl bg-white p-4 shadow">
            {/* タイトル */}
            <div className="font-semibold">{ev.title}</div>

            {/* 日付行の右端に削除ボタン（管理者のみ） */}
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

            {/* 参加者 */}
            <ParticipantsLine
              people={ev.participantProfiles}
              me={userId ?? undefined}
            />

            {/* 待機者（いるときのみ） */}
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
                <div className="text-xs text-red-500 mt-1">
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
