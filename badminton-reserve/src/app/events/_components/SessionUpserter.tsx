// src/app/events/_components/SessionUpserter.tsx
"use client";
import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

export default function SessionUpserter() {
  const { status } = useSession();
  const once = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !once.current) {
      once.current = true;
      fetch("/api/me/upsert", { method: "POST" }).catch(() => {});
    }
  }, [status]);

  return null;
}
