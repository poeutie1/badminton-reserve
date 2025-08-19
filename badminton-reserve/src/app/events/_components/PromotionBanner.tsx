"use client";
import { useRouter } from "next/navigation";

export type Note = { id: string; title: string; whenText: string; url: string };

export default function PromotionBanner({ notes }: { notes: Note[] }) {
  const router = useRouter();
  if (!notes.length) return null;

  const mark = async (id: string) => {
    const res = await fetch(`/api/me/notifications/${id}/read`, {
      method: "POST",
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className="mb-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
      <div className="font-semibold text-blue-900">
        キャンセル待ち繰り上げのお知らせ
      </div>
      <ul className="mt-2 space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="flex items-center justify-between">
            <a href={n.url} className="text-blue-700 underline">
              {n.title}（{n.whenText}）
            </a>
            <button
              onClick={() => mark(n.id)}
              className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-white"
            >
              既読にする
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
