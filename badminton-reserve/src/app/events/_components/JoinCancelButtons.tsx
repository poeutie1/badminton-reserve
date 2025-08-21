"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export default function CancelButtons({
  id,
  joined,
  inWaitlist,
  full,
  disabled = false,
}: {
  id: string;
  joined: boolean;
  inWaitlist: boolean;
  full: boolean; // 参加時に満席なら待機に入る表示を出すため
  disabled?: boolean; // 未ログインなど
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 楽観的UI（最初はサーバー判定を反映）
  const [state, setState] = useState<{ joined: boolean; inWaitlist: boolean }>({
    joined,
    inWaitlist,
  });

  async function call(action: "join" | "cancel") {
    // 1) 楽観的にUIを先に更新
    const prev = { ...state };
    if (action === "join") {
      setState({ joined: true, inWaitlist: full || prev.inWaitlist });
    } else {
      setState({ joined: false, inWaitlist: false });
    }

    // 2) API 実行
    const res = await fetch(`/api/events/${id}/${action}`, { method: "POST" });

    // 3) 失敗なら巻き戻し
    if (!res.ok) {
      setState(prev);
      const msg = await res.text().catch(() => "");
      alert(msg || `${action} に失敗しました`);
      return;
    }

    // 4) 成功したらサーバー状態で再同期
    startTransition(() => router.refresh());
  }

  // 参加済みなら「キャンセル」一本に切替
  if (state.joined) {
    return (
      <button
        onClick={() => call("cancel")}
        disabled={isPending || disabled}
        className="px-3 py-1 rounded border disabled:opacity-50"
      >
        {state.inWaitlist ? "待機を取り消す" : "キャンセル"}
      </button>
    );
  }

  // 未参加
  return (
    <button
      onClick={() => call("join")}
      disabled={isPending || disabled}
      className="px-3 py-1 rounded bg-black text-white disabled:opacity-50"
      title={
        full ? "定員に達しているため、参加すると待機になります" : undefined
      }
    >
      {full ? "待機に入る" : "参加する"}
    </button>
  );
}
