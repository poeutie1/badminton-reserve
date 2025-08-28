// src/app/admin/page.tsx
"use client";
import { useState } from "react";

export default function AdminPage() {
  const [form, setForm] = useState({
    title: "豊島区立明豊中学校18:50~22:00",
    date: "",
    capacity: 21,
  });
  const create = async () => {
    await fetch("/api/admin/events", {
      method: "POST",
      body: JSON.stringify(form),
      credentials: "include",
    });
    alert("作成しました");
  };
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold">イベント作成</h1>
      <input
        className="input"
        placeholder="タイトル"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <input
        className="input"
        type="date"
        value={form.date}
        onChange={(e) => setForm({ ...form, date: e.target.value })}
      />
      <input
        className="input"
        type="number"
        value={form.capacity}
        onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
      />
      <button
        className="px-3 py-2 rounded bg-black text-white"
        onClick={create}
      >
        作成
      </button>
      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          background: white;
        }
      `}</style>
    </div>
  );
}
