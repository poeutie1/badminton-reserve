"use client";
import { useState } from "react";

export default function MyPage() {
  const [form, setForm] = useState({
    nickname: "",
    level: "公式大会3部で入賞2回以上あり",
    gender: "女性",
    message: "",
    years: 0,
    hometown: "",
    likes: "",
  });
  const save = async () => {
    await fetch("/api/profile", { method: "POST", body: JSON.stringify(form) });
    alert("保存しました");
  };
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">プロフィール</h1>
      <label className="block">
        ニックネーム
        <input
          className="input"
          value={form.nickname}
          onChange={(e) => setForm({ ...form, nickname: e.target.value })}
        />
      </label>
      <label className="block">
        レベル
        <select
          className="input"
          value={form.level}
          onChange={(e) => setForm({ ...form, level: e.target.value })}
        >
          <option>初心者</option>
          <option>初級</option>
          <option>中級</option>
          <option>上級</option>
          <option>公式大会3部で入賞2回以上あり</option>
        </select>
      </label>
      <label className="block">
        性別
        <select
          className="input"
          value={form.gender}
          onChange={(e) => setForm({ ...form, gender: e.target.value })}
        >
          <option>男性</option>
          <option>女性</option>
          <option>未回答</option>
        </select>
      </label>
      <label className="block">
        ザンバドのみんなに一言
        <textarea
          className="input"
          value={form.message}
          onChange={(e) => setForm({ ...form, message: e.target.value })}
        />
      </label>
      <label className="block">
        バドミントン歴
        <input
          type="number"
          className="input"
          value={form.years}
          onChange={(e) => setForm({ ...form, years: Number(e.target.value) })}
        />
      </label>
      <label className="block">
        出身地
        <input
          className="input"
          value={form.hometown}
          onChange={(e) => setForm({ ...form, hometown: e.target.value })}
        />
      </label>
      <label className="block">
        バド以外で好きな事・物・人
        <textarea
          className="input"
          value={form.likes}
          onChange={(e) => setForm({ ...form, likes: e.target.value })}
        />
      </label>
      <button onClick={save} className="px-3 py-2 rounded bg-black text-white">
        保存
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
