// src/app/events/_components/DeleteEventButton.tsx
"use client";
import { useRouter } from "next/navigation";

export default function DeleteEventButton({
  id,
  title,
  compact = false,
}: {
  id: string;
  title: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const onDelete = async () => {
    if (!confirm(`「${title}」を削除します。よろしいですか？`)) return;
    const res = await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`削除失敗: ${res.status} ${j.error ?? ""}`);
      return;
    }
    router.refresh();
  };
  const cls = compact
    ? "px-2 py-0.5 rounded border border-red-300 text-red-600 text-xs hover:bg-red-50"
    : "px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50";
  return (
    <button onClick={onDelete} className={cls}>
      削除
    </button>
  );
}
