// 例: src/app/events/_components/NotificationCard.tsx
"use client";
import { useState } from "react";

type Props = {
  id: string;
  title: string;
  eventId?: string;
  onRead?: (id: string) => void;
};

export default function NotificationCard({
  id,
  title,
  eventId,
  onRead,
}: Props) {
  const [loading, setLoading] = useState(false);

  async function markRead() {
    setLoading(true);
    const res = await fetch(
      `/api/me/notifications/${encodeURIComponent(id)}/read`,
      { method: "POST" }
    );
    setLoading(false);
    if (res.ok) onRead?.(id);
  }

  return (
    <div className="rounded-xl border p-3 bg-blue-50">
      <div className="flex items-start justify-between">
        <h3 className="font-semibold">{title}</h3>
        <button className="btn btn-sm" onClick={markRead} disabled={loading}>
          既読にする
        </button>
      </div>

      {eventId && (
        <a className="text-blue-600 underline" href={`/events/${eventId}`}>
          イベント内容の確認
        </a>
      )}
    </div>
  );
}
