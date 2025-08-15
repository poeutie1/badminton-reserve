"use client";

import { useEffect, useRef } from "react";

/**
 * 初回マウント時に /api/me/upsert をPOSTして
 * セッションの displayName / 画像 を users コレクションへ同期。
 * 未ログイン時は 401 で何も起きないので放置でOK。
 */
export default function SessionUpserter() {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    fetch("/api/me/upsert", { method: "POST" }).catch(() => {
      /* 失敗してもUIは影響なし */
    });
  }, []);

  return null;
}
