// src/app/events/_components/RemoveGuestButton.tsx
"use client";
import { useState } from "react";

export default function RemoveGuestButton({
  eventId,
  guestId,
  guestName,
}: {
  eventId: string;
  guestId: string;
  guestName: string;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!confirm(`ゲスト「${guestName}」を削除しますか？`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ guestId }),
      });
      if (!res.ok) {
        alert(`削除失敗 (${res.status})`);
        return;
      }
      location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="ml-1 text-red-400 hover:text-red-600 text-xs"
      title="ゲストを削除"
    >
      ×
    </button>
  );
}
