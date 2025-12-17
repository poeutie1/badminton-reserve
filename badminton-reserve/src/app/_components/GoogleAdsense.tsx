// app/_components/GoogleAdsense.tsx
"use client";

import Script from "next/script";

type Props = {
  clientId: string; // "ca-pub-~~~~" をそのまま渡す
};

const GoogleAdsense: React.FC<Props> = ({ clientId }) => {
  // デバッグ中は dev でも出したいので、慣れるまではコメントアウトでOK
  // if (process.env.NODE_ENV !== "production") return null;

  return (
    <Script
      async
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`}
      crossOrigin="anonymous"
      strategy="afterInteractive"
    />
  );
};

export default GoogleAdsense;
