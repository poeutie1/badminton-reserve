"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteEventButton({
  id,
  title,
  compact = false,
}: {
  id: string;
  title?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (!confirm(`「${title ?? id}」を削除します。よろしいですか？`)) return;
    setBusy(true);
    const res = await fetch(`/api/admin/events/${id}/delete`, {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j?.error ?? "削除に失敗しました（権限）");
      return;
    }
    router.refresh();
  };

  const cls = compact
    ? "text-red-600 text-xs underline disabled:opacity-50"
    : "px-3 py-1 rounded border border-red-500 text-red-600 disabled:opacity-50";

  return (
    <button onClick={onClick} disabled={busy} className={cls}>
      {busy ? "削除中…" : "削除"}
    </button>
  );
}
