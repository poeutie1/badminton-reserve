// 例: src/app/mypage/EnsureProfile.tsx
"use client";
import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function EnsureProfile() {
  const { status, data } = useSession();

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/me/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.user?.name,
          image: data.user?.image,
        }),
      }).catch(() => {});
    }
  }, [status, data?.user?.name, data?.user?.image]);

  return null;
}
