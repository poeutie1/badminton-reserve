// src/app/events/[year]/[month]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { auth } from "@/auth";
import { isAdminByUid } from "@/lib/isAdmin";
import { getAdminDb } from "@/lib/firebaseAdmin";

import JoinCancelButtons from "@/app/events/_components/JoinCancelButtons";
import ParticipantsLine from "@/app/events/_components/ParticipantsLine";
import PromotionBanner, {
  type Note,
} from "@/app/events/_components/PromotionBanner";
import WaitlistLine from "@/app/events/_components/WaitlistLine";
import DeleteEventButton from "@/app/events/_components/DeleteEventButton";

import { FieldValue } from "firebase-admin/firestore";
import type {
  WriteResult,
  QueryDocumentSnapshot,
  DocumentSnapshot,
} from "firebase-admin/firestore";

/* ========= Types ========= */
export type Gender = "男性" | "女性" | "未回答";

type UserProfile = {
  displayName?: string;
  preferredName?: string;
  nickname?: string;
  name?: string;
  gender?: Gender;
  years?: number;
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

/* ========= Utils ========= */
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

function fmtJstDate(d: Date) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "日付未設定";
  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
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
  Pick<
    UserProfile,
    "displayName" | "preferredName" | "nickname" | "name" | "years" | "gender"
  >
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
  return new Date();
}

// JSTの月境界をUTCに直した Date を返す
function monthRangeJST(year: number, month: number) {
  const JST_OFFSET = 9 * 60 * 60 * 1000;
  const jstStart = Date.UTC(year, month - 1, 1, 0, 0, 0);
  const jstEnd = Date.UTC(year, month, 1, 0, 0, 0);
  return {
    start: new Date(jstStart - JST_OFFSET),
    end: new Date(jstEnd - JST_OFFSET),
  };
}

/* ========= Page ========= */
type Props = { params: Promise<{ year: string; month: string }> };

export default async function EventsPage({ params }: Props) {
  const { year: yStr, month: mStr } = await params;
  const year = Number(yStr);
  const month = Number(mStr);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return <div className="p-6">不正な年月です。</div>;
  }

  const session = await auth();
  const uid = (session?.user as { id?: string | null } | undefined)?.id ?? null;
  const isAdmin = isAdminByUid(uid);

  const userId: string | null =
    (
      session?.user as
        | { id?: string; uid?: string; email?: string; name?: string }
        | undefined
    )?.id ?? null;

  const db = getAdminDb();
  const { start, end } = monthRangeJST(year, month);

  // 月内のイベントのみ取得
  const snap = await db
    .collection("events")
    .where("date", ">=", start)
    .where("date", "<", end)
    .orderBy("date")
    .get();

  // --- 1) セルフヒーリング ---
  const toFix: Promise<WriteResult>[] = [];
  type BaseRow = {
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
  };

  const base: BaseRow[] = snap.docs.map((d: QueryDocumentSnapshot) => {
    const raw = d.data() as Record<string, unknown>;

    const data: EventDoc = {
      title: typeof raw.title === "string" ? raw.title : undefined,
      date: raw.date,
      capacity: typeof raw.capacity === "number" ? raw.capacity : undefined,
      participants: Array.isArray(raw.participants)
        ? (raw.participants as unknown[])
        : [],
      waitlist: Array.isArray(raw.waitlist) ? (raw.waitlist as unknown[]) : [],
      location: typeof raw.location === "string" ? raw.location : undefined,
      time: typeof raw.time === "string" ? raw.time : undefined,
    };

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

  // --- 2) プロフィール解決 ---
  const allIds = Array.from(
    new Set(base.flatMap((e) => [...e.participants, ...e.waitlist]))
  );

  const profilesMap = new Map<string, ProfileDoc>();
  if (allIds.length) {
    const refs = allIds.map((id) => db.collection("profiles").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s: DocumentSnapshot) =>
      profilesMap.set(s.id, s.exists ? (s.data() as ProfileDoc) : {})
    );
  }

  const usersMap = new Map<string, UserProfile>();
  if (allIds.length) {
    const refs = allIds.map((id) => db.collection("users").doc(id));
    const snaps = await db.getAll(...refs);
    snaps.forEach((s: DocumentSnapshot) =>
      usersMap.set(s.id, s.exists ? (s.data() as UserProfile) : {})
    );
  }

  const labelWithMeta = (
    name: string,
    gender?: Gender | null,
    years?: number
  ) => {
    const tags: string[] = [];
    if (gender && gender !== "未回答") tags.push(gender);
    if (typeof years === "number") tags.push(`${years}年`);
    return tags.length ? `${name}（${tags.join("・")}）` : name;
  };

  const events: EventRow[] = base.map((e) => ({
    ...e,
    participantProfiles: e.participants.map((id) => {
      const fromProfile = profilesMap.get(id);
      const fromUser = usersMap.get(id);
      const baseName =
        pickName(fromProfile) ?? pickName(fromUser) ?? maskId(id);
      const gender = fromProfile?.gender ?? fromUser?.gender ?? null;
      const years = fromProfile?.years ?? fromUser?.years;
      return {
        id,
        name: labelWithMeta(baseName, gender, years),
        avatarUrl: fromProfile?.avatarUrl ?? fromUser?.avatarUrl ?? null,
      };
    }),
    waitlistProfiles: e.waitlist.map((id) => {
      const fromProfile = profilesMap.get(id);
      const fromUser = usersMap.get(id);
      const baseName =
        pickName(fromProfile) ?? pickName(fromUser) ?? maskId(id);
      const gender = fromProfile?.gender ?? fromUser?.gender ?? null;
      const years = fromProfile?.years ?? fromUser?.years;
      return {
        id,
        name: labelWithMeta(baseName, gender, years),
        avatarUrl: fromProfile?.avatarUrl ?? fromUser?.avatarUrl ?? null,
      };
    }),
  }));

  // --- 2.5) 未読通知 ---
  let notes: Note[] = [];
  if (userId) {
    const snapN = await db
      .collection("users")
      .doc(userId)
      .collection("notifications")
      .where("isRead", "==", false)
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();

    notes = snapN.docs.map((d: QueryDocumentSnapshot) => {
      const x = d.data() as Partial<Note>;
      return {
        id: d.id,
        title: x.title ?? "",
        whenText: x.whenText ?? "",
        url: x.url ?? "/events",
      };
    });
  }

  // --- 3) 描画 ---
  return (
    <div className="space-y-3 p-4">
      {/* デバッグ用（必要なくなったら削除OK） */}
      <div
        data-build={process.env.VERCEL_GIT_COMMIT_SHA ?? "local"}
        data-admin={JSON.stringify({ admin: isAdmin, uid })}
        className="hidden"
      />

      <PromotionBanner notes={notes} />

      {events.map((ev) => (
        <div key={ev.id} className="rounded-xl bg-white p-4 shadow">
          <div className="font-semibold">{ev.title}</div>
          <div className="font-semibold">{fmtJstDate(ev.date)}</div>

          <div className="mt-1 flex items-center justify-between text-sm text-gray-500">
            {isAdmin && (
              <span className="text-xs text-red-500">[admin mode]</span>
            )}
            {isAdmin && (
              <DeleteEventButton id={ev.id} title={ev.title} compact />
            )}
          </div>

          {ev.location && (
            <div className="text-sm text-gray-500">📍 {ev.location}</div>
          )}

          <details className="mt-3 group" open={ev.joined || ev.inWaitlist}>
            <summary className="cursor-pointer select-none text-sm text-gray-600 flex items-center gap-2">
              <span className="group-open:hidden">▼参加者一覧</span>
              <span className="hidden group-open:inline">閉じる</span>
              <span className="text-gray-500">
                （参加: {ev.participants.length}/定員: {ev.capacity}
                {ev.waitlistProfiles.length
                  ? `・待機 ${ev.waitlistProfiles.length}`
                  : ""}
                ）
              </span>
            </summary>

            <div className="mt-2 border-t pt-2 space-y-2">
              <ParticipantsLine
                people={ev.participantProfiles}
                me={userId ?? undefined}
                adminEventId={isAdmin ? ev.id : undefined} // ★ 追加
              />

              {ev.waitlistProfiles.length > 0 && (
                <WaitlistLine
                  people={ev.waitlistProfiles}
                  me={userId ?? undefined}
                  adminEventId={isAdmin ? ev.id : undefined} // ★ 追加
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
          </details>
        </div>
      ))}
    </div>
  );
}
