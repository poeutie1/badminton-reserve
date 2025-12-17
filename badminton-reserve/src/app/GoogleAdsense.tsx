// app/GoogleAdsense.tsx
"use client";

import { useEffect } from "react";

type Props = {
  clientId: string; // "ca-pub-~~~~" をそのまま渡す
};

export default function GoogleAdsense({ clientId }: Props) {
  useEffect(() => {
    // 同じ clientId の script が既に挿入されていたら二重読み込みを防ぐ
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-adsense-client="${clientId}"]`
    );
    if (existing) return;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
    script.crossOrigin = "anonymous";
    script.setAttribute("data-adsense-client", clientId);

    document.head.appendChild(script);

    // 所有権確認用なら、unmount時に消す必要は特にない
    // return () => {
    //   script.remove();
    // };
  }, [clientId]);

  // 画面には何も描画しない
  return null;
}
