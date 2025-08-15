// src/app/events/page.tsx
import { getAdminDb } from "@/lib/firebaseAdmin";
import { auth } from "@/auth";
import JoinCancelButtons from "./_components/JoinCancelButtons";
import ParticipantsLine from "./_components/ParticipantsLine";
import WaitlistLine from "./_components/WaitlistLine";
import { FieldValue, type WriteResult } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserProfile = { displayName?: string; avatarUrl?: string | null };

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
    // ダミー系除去
    .filter((s) => !/^dummy[-_ ]?user$/i.test(s))
    .filter((s) => !/^dummy/i.test(s))
    // 正規フォーマットのみ（例: line:xxxx / google:xxxx）
    .filter((s) => /^[a-z]+:/.test(s));
  return Array.from(new Set(cleaned)); // 重複除去
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

export default async function EventsPage() {
  const session = await auth();
  // v5: session.user.id（←推奨）。互換のため uid / email / name も最後にフォールバック
  const userId =
    (session?.user as any)?.id ||
    (session?.user as any)?.uid ||
    session?.user?.email ||
    session?.user?.name ||
    null;

  const db = getAdminDb();
  const snap = await db.collection("events").orderBy("date").get();

  // --- 1) セルフヒーリング（読み込み時に静かに正規化）---
  const toFix: Promise<WriteResult>[] = [];

  const base = snap.docs.map((d) => {
    const data = d.data() as any;

    const rawParticipants: string[] = data.participants ?? [];
    const rawWaitlist: string[] = data.waitlist ?? [];

    const p = normalizeIds(rawParticipants);
    const w0 = normalizeIds(rawWaitlist);
    const w = w0.filter((id) => !p.includes(id)); // 参加と重複するIDは待機から除外

    if (
      p.length !== rawParticipants.length ||
      w.length !== rawWaitlist.length
    ) {
      // 差分があるときだけバックグラウンドで修復
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

  // 修復は待たずに並行実行（UX優先。失敗してもUIは影響なし）
  Promise.allSettled(toFix).catch(() => {});

  // --- 2) users をまとめて解決（displayName / avatar）---
  const allIds = Array.from(
    new Set(base.flatMap((e) => [...e.participants, ...e.waitlist]))
  );
  const userRefs = allIds.map((id) => db.collection("users").doc(id));
  const userSnaps = allIds.length ? await db.getAll(...userRefs) : [];
  const usersMap = new Map<string, UserProfile>();
  userSnaps.forEach((s) =>
    usersMap.set(s.id, s.exists ? (s.data() as UserProfile) : {})
  );

  const events: EventRow[] = base.map((e) => ({
    ...e,
    participantProfiles: e.participants.map((id) => ({
      id,
      name: usersMap.get(id)?.displayName || maskId(id),
      avatarUrl: usersMap.get(id)?.avatarUrl ?? null,
    })),
    waitlistProfiles: e.waitlist.map((id) => ({
      id,
      name: usersMap.get(id)?.displayName || maskId(id),
      avatarUrl: usersMap.get(id)?.avatarUrl ?? null,
    })),
  }));

  // --- 3) 描画 ---
  return (
    <div className="space-y-3 p-4">
      {events.map((ev) => {
        const filled = `${ev.participants.length}/${ev.capacity}`;
        const when = ev.date.toLocaleString("ja-JP", {
          timeZone: "Asia/Tokyo",
        });

        return (
          <div key={ev.id} className="rounded-xl bg-white p-4 shadow">
            <div className="font-semibold">{ev.title}</div>
            <div className="text-sm text-gray-500">
              {when}
              {ev.time ? `・${ev.time}` : ""}・{filled}
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
