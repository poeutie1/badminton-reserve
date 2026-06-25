// src/app/events/_components/AddGuestButton.tsx
"use client";
import { useState } from "react";

export default function AddGuestButton({ eventId }: { eventId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<string>("");
  const [years, setYears] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (gender) body.gender = gender;
      if (years !== "") body.years = Number(years);

      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `追加失敗 (${res.status})`);
        return;
      }
      setName("");
      setGender("");
      setYears("");
      setOpen(false);
      location.reload();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-blue-600 underline"
      >
        + ゲスト追加
      </button>
    );
  }

  return (
    <div className="mt-2 rounded border border-gray-200 bg-gray-50 dark:bg-gray-700 p-3 space-y-2">
      <div className="text-sm font-semibold">ゲスト追加</div>
      <input
        type="text"
        placeholder="名前（必須）"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        disabled={busy}
      />
      <div className="flex gap-2">
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={busy}
        >
          <option value="">性別</option>
          <option value="男性">男性</option>
          <option value="女性">女性</option>
        </select>
        <input
          type="number"
          placeholder="経験年数"
          value={years}
          onChange={(e) => setYears(e.target.value)}
          min={0}
          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={busy}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={busy || !name.trim()}
          className="text-sm text-white bg-blue-600 rounded px-3 py-1 disabled:opacity-50"
        >
          追加
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-sm text-gray-500 underline"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
