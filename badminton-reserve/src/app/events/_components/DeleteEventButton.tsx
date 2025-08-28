// src/app/events/_components/DeleteEventButton.tsx
"use client";
import { useState } from "react";

export default function DeleteEventButton({
  id,
  title,
  compact,
}: {
  id: string;
  title: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!confirm(`「${title}」を削除します。よろしいですか？`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/events/${id}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 同一オリジンなので credentials 既定でOKだが、明示しても可:
        credentials: "same-origin",
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(`削除失敗 (${res.status}) ${msg}`);
        return;
      }
      // 成功 → 再読み込み or 楽観的に DOM から消す
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
      data-testid="delete-button"
      className={
        compact ? "text-red-500 underline text-sm" : "px-2 py-1 text-red-600"
      }
    >
      削除
    </button>
  );
}
