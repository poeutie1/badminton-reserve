// src/app/mypage/page.tsx
"use client";
import { useEffect, useState } from "react";

type Profile = {
  nickname: string;
  level: string;
  gender: string;
  message?: string;
  years?: number;
  hometown?: string;
  likes?: string;
};

const initial: Profile = {
  nickname: "",
  level: "公式大会3部で入賞2回以上あり",
  gender: "女性",
  message: "",
  years: 0,
  hometown: "",
  likes: "",
};

export default function MyPage() {
  const [form, setForm] = useState<Profile>(initial);
  const [loading, setLoading] = useState(true);

  // ← 追加：保存済みプロフィールを読み込む
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/profile", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as Partial<Profile>;
          setForm({ ...initial, ...data }); // 既存値で上書き
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) alert("保存しました");
    else alert("保存に失敗しました");
  };

  if (loading) return <div>読み込み中…</div>;

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
          value={form.years ?? 0}
          onChange={(e) => setForm({ ...form, years: Number(e.target.value) })}
        />
      </label>

      <label className="block">
        出身地
        <input
          className="input"
          value={form.hometown ?? ""}
          onChange={(e) => setForm({ ...form, hometown: e.target.value })}
        />
      </label>

      <label className="block">
        バド以外で好きな事・物・人
        <textarea
          className="input"
          value={form.likes ?? ""}
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
