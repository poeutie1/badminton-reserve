"use client";

import { useState } from "react";
import { signIn, useSession } from "next-auth/react";

export default function LocalPreviewControls() {
  const { data: session, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(user: string) {
    setBusy(true);
    setError("");
    try {
      const result = await signIn("local-preview", { user, redirect: false });
      if (result?.error) throw new Error("確認用ログインに失敗しました");
      const response = await fetch("/api/local-preview/session", { method: "POST" });
      if (!response.ok) throw new Error("確認用の権限を設定できませんでした");
      const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
      location.href = location.pathname.startsWith("/events/")
        ? location.pathname : `/events/${now.getUTCFullYear()}/${now.getUTCMonth() + 1}`;
    } catch (error) {
      setError(error instanceof Error ? error.message : "ログインに失敗しました");
      setBusy(false);
    }
  }
  return (
    <aside className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-2">
        <strong>ローカル確認用</strong>
        <span>テストデータ・LINE通知なし</span>
        <span className="mr-auto">{session?.user?.name ? `${session.user.name}でログイン中` : "確認するユーザーを選択"}</span>
        {[{ id: "admin", label: "管理者で確認" }, { id: "member-a", label: "会員Aで確認" }, { id: "member-b", label: "会員Bで確認" }].map(user => (
          <button key={user.id} disabled={busy || status === "loading"} onClick={() => login(user.id)}
            className="rounded border border-amber-400 bg-white px-2 py-1 disabled:opacity-50">{user.label}</button>
        ))}
        {error && <p role="alert" className="w-full text-red-700">{error}</p>}
      </div>
    </aside>
  );
}
