// src/app/mypage/page.tsx
"use client";
import { useEffect, useState } from "react";

type Profile = {
  nickname: string;
  gender: string;
  message?: string;
  years?: number;
  hometown?: string;
  likes?: string;
};

const initial: Profile = {
  nickname: "",
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
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(`保存に失敗しました: ${json.error ?? res.status}`);
      return;
    }
    alert("保存しました");
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
        バドミントン歴
        <input
          type="number"
          className="input"
          value={form.years ?? 0}
          onChange={(e) => setForm({ ...form, years: Number(e.target.value) })}
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
