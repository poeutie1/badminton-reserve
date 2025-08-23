"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.replace("/admin"); // 管理トップへ
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j?.error ?? "Login failed");
    }
  };

  return (
    <div className="p-6 max-w-sm mx-auto">
      <h1 className="text-xl font-bold mb-4">Admin Login</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          type="password"
          className="w-full border rounded p-2"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="px-4 py-2 rounded bg-black text-white">Login</button>
      </form>
    </div>
  );
}
