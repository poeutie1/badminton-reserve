// src/app/login/LoginClient.tsx
"use client";
import { signIn } from "next-auth/react";

export default function LoginClient() {
  return (
    <button
      onClick={() => signIn("line", { callbackUrl: "/events" })}
      className="px-4 py-2 rounded bg-black text-white"
    >
      LINEでログイン
    </button>
  );
}
