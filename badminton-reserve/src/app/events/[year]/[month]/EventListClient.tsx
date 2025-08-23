"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  getFirestore,
  query,
  where,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from "firebase/firestore";
import { app } from "@/lib/firebase";

/* ========= Types ========= */

type Event = {
  id: string;
  title: string;
  place?: string;
};

type Participant = {
  id: string;
  name?: string;
  avatar?: string;
  status?: string;
};

/* ========= Converters (no any) ========= */

type EventDoc = { title: string; place?: string };
const eventConverter: FirestoreDataConverter<EventDoc> = {
  toFirestore(v) {
    const out: Record<string, unknown> = { title: v.title };
    if (v.place) out.place = v.place;
    return out;
  },
  fromFirestore(
    snap: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): EventDoc {
    const d = snap.data(options) as Record<string, unknown>;
    return {
      title: typeof d.title === "string" ? d.title : "",
      place: typeof d.place === "string" ? d.place : undefined,
    };
  },
};

type ParticipantDoc = { name?: string; avatar?: string; status?: string };
const participantConverter: FirestoreDataConverter<ParticipantDoc> = {
  toFirestore(v) {
    const out: Record<string, unknown> = {};
    if (v.name) out.name = v.name;
    if (v.avatar) out.avatar = v.avatar;
    if (v.status) out.status = v.status;
    return out;
  },
  fromFirestore(
    snap: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): ParticipantDoc {
    const d = snap.data(options) as Record<string, unknown>;
    return {
      name: typeof d.name === "string" ? d.name : undefined,
      avatar: typeof d.avatar === "string" ? d.avatar : undefined,
      status: typeof d.status === "string" ? d.status : undefined,
    };
  },
};

/* ========= List ========= */

export default function EventListClient({
  year,
  month,
}: {
  year: number;
  month: number;
}) {
  const db = useMemo(() => getFirestore(app), []);
  const [{ loading, items, error }, setState] = useState<{
    loading: boolean;
    items: Event[];
    error?: string;
  }>({ loading: true, items: [] });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setState((s) => ({ ...s, loading: true, error: undefined }));
        const qref = query(
          collection(db, "events").withConverter(eventConverter)
        );
        const snap = await getDocs(qref);
        const rows = snap.docs.map<Event>((d) => ({
          id: d.id,
          ...d.data(),
        }));
        if (!alive) return;
        setState({ loading: false, items: rows });
      } catch (e: unknown) {
        if (!alive) return;
        const msg = e instanceof Error ? e.message : "Unknown error";
        setState({ loading: false, items: [], error: msg });
      }
    })();
    return () => {
      alive = false;
    };
  }, [db, year, month]);

  if (loading) return <div className="p-4">読み込み中…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (items.length === 0)
    return <div className="p-4">この月のイベントはありません。</div>;

  return (
    <ul className="space-y-3">
      {items.map((ev) => (
        <li key={ev.id}>
          <EventCollapsible ev={ev} />
        </li>
      ))}
    </ul>
  );
}

/* ========= Item ========= */

function EventCollapsible({ ev }: { ev: Event }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<Participant[] | null>(null);

  const db = useMemo(() => getFirestore(app), []);

  // 初回 open 時のみ参加者を読む（遅延ロード）
  useEffect(() => {
    if (!open || people) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const qref = query(
          collection(db, "events", ev.id, "participants").withConverter(
            participantConverter
          ),
          where("status", "==", "in")
        );
        const snap = await getDocs(qref);
        const ps = snap.docs.map<Participant>((d) => ({
          id: d.id,
          ...d.data(),
        }));
        if (!alive) return;
        setPeople(ps);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, people, db, ev.id]);

  return (
    <details
      className="rounded-xl border p-3 open:shadow-sm"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-base font-medium">{ev.title}</span>
          {ev.place && (
            <span className="text-sm text-gray-600">{ev.place}</span>
          )}
        </div>
        <span className="text-sm text-blue-600 underline">もっと見る</span>
      </summary>

      <div className="mt-3 border-t pt-3 space-y-2">
        {/* ここに参加ボタン等を配置（あなたの既存APIに差し替え） */}
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded bg-black text-white disabled:opacity-50">
            参加する
          </button>
          <button className="px-3 py-1 rounded border">キャンセル</button>
        </div>

        <div className="mt-2">
          <div className="text-sm text-gray-700 mb-1">参加者</div>
          {loading && <div className="text-sm text-gray-500">読み込み中…</div>}
          {!loading && people && people.length === 0 && (
            <div className="text-sm text-gray-500">まだいません</div>
          )}
          {!loading && people && people.length > 0 && (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {people.map((p) => (
                <li key={p.id} className="text-sm">
                  {p.name ?? p.id}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </details>
  );
}
