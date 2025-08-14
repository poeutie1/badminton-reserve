"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

type EventRow = {
  id: string;
  title: string;
  date: string;
  capacity: number;
  participants: string[];
  waitlist: string[];
};

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);

  useEffect(() => {
    const q = query(collection(db, "events"), orderBy("date"));
    const unsub = onSnapshot(q, (snap) => {
      const rows: EventRow[] = snap.docs.map((d) => {
        const data = d.data() as Omit<EventRow, "id">;
        return { id: d.id, ...data };
      });
      setEvents(rows);
    });
    return () => unsub();
  }, []);

  const call = async (id: string, action: "join" | "cancel") => {
    await fetch(`/api/events/${id}/${action}`, { method: "POST" });
  };

  return (
    <div className="space-y-3">
      {events.map((ev) => {
        const filled = `${ev.participants?.length ?? 0}/${ev.capacity}`;
        return (
          <div key={ev.id} className="rounded-xl bg-white p-4 shadow">
            <div className="font-semibold">{ev.title}</div>
            <div className="text-sm text-gray-500">
              {new Date(ev.date).toLocaleString()}・{filled}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => call(ev.id, "join")}
                className="px-3 py-1 rounded bg-black text-white"
              >
                参加する
              </button>
              <button
                onClick={() => call(ev.id, "cancel")}
                className="px-3 py-1 rounded border"
              >
                キャンセル
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
