// src/app/events/_components/EditCapacityButton.tsx
"use client";
import { useState } from "react";

export default function EditCapacityButton({
  eventId,
  currentCapacity,
}: {
  eventId: string;
  currentCapacity: number;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(currentCapacity);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (value === currentCapacity) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ capacity: value }),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        alert(`更新失敗 (${res.status}) ${msg}`);
        return;
      }
      setEditing(false);
      location.reload();
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-blue-600 underline text-sm ml-1"
      >
        定員変更
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 ml-1">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        className="w-16 rounded border border-gray-300 px-1 py-0.5 text-sm"
        disabled={busy}
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="text-sm text-white bg-blue-600 rounded px-2 py-0.5 disabled:opacity-50"
      >
        保存
      </button>
      <button
        type="button"
        onClick={() => {
          setValue(currentCapacity);
          setEditing(false);
        }}
        disabled={busy}
        className="text-sm text-gray-500 underline"
      >
        取消
      </button>
    </span>
  );
}
