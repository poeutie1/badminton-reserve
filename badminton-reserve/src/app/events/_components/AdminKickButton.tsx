"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminKickButton({
  eventId,
  targetUserId,
  promote, // 参加から外すなら true、待機から外すなら false
  title,
}: {
  eventId: string;
  targetUserId: string;
  promote: boolean;
  title?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const label = promote ? "外" : "除外";

  return (
    <button
      onClick={async () => {
        if (busy) return;
        if (
          !confirm(
            `${title ?? ""}\nこのユーザーを${label}します。よろしいですか？`
          )
        )
          return;
        setBusy(true);
        const res = await fetch(`/api/events/${eventId}/admin/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: targetUserId, promote, notify: true }),
        });
        setBusy(false);
        if (!res.ok) {
          const msg = await res.text().catch(() => "");
          alert(msg || "管理者キャンセルに失敗しました");
          return;
        }
        router.refresh();
      }}
      disabled={busy}
      className="ml-1 rounded px-1.5 text-xs border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
      title={
        promote ? "参加から外す（繰上げあり）" : "待機から外す（繰上げなし）"
      }
    >
      ×
    </button>
  );
}
