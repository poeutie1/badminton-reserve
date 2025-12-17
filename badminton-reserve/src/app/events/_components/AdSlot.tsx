"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type Props = {
  slotId: string;
  className?: string;
};

export default function AdSlot({ slotId, className }: Props) {
  useEffect(() => {
    // Google の広告スクリプトへ描画を依頼する
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.error("adsbygoogle push failed", error);
    }
  }, []);

  if (!slotId) return null;

  return (
    <ins
      className={`adsbygoogle block my-4 ${className ?? ""}`.trim()}
      style={{ display: "block" }}
      data-ad-client="ca-pub-9264651168388030"
      data-ad-slot={slotId}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
