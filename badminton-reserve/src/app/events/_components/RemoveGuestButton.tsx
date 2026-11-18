// src/app/events/_components/RemoveGuestButton.tsx
"use client";
import { useState } from "react";

export default function RemoveGuestButton({
  eventId,
  guestId,
  guestName,
  waiting = false,
}: {
  eventId: string;
  guestId: string;
  guestName: string;
  waiting?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const onClick = async () => {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ guestId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : `削除に失敗しました（${res.status}）`);
        return;
      }
      location.reload();
    } catch {
      setError("通信に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="ml-1 text-red-400 hover:text-red-600 text-xs"
        title={waiting ? "ゲストのキャンセル待ちを取り消す" : "ゲストを削除"}
        aria-label={waiting ? `${guestName}のキャンセル待ちを取り消す` : `${guestName}を削除`}
      >
        ×
      </button>
      {error && <span role="alert" className="text-sm text-red-600">{error}</span>}
    </span>
  );
}
