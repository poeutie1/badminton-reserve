// src/app/login/LoginClient.tsx
"use client";
import { signIn, signOut, useSession } from "next-auth/react";

export default function LoginClient() {
  const { data: session } = useSession();

  return (
    <div className="space-y-4">
      {session ? (
        <>
          <p className="text-sm text-gray-600">
            {session.user?.name ?? "ユーザー"} でログイン中
          </p>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-4 py-2 rounded bg-red-500 text-white"
          >
            ログアウト
          </button>
        </>
      ) : (
        <button
          onClick={() => signIn("line", { callbackUrl: "/events" })}
          className="px-4 py-2 rounded bg-black text-white"
        >
          LINEでログイン
        </button>
      )}
    </div>
  );
}
