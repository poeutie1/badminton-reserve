"use client";

import { useState } from "react";

type FormState = "idle" | "submitting" | "success" | "error";

export default function ContactForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "submitting") return;
    setState("submitting");
    setError(null);

    const formElement = event.currentTarget;
    const formData = new FormData(formElement);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
    };

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body?.error ?? "送信に失敗しました。時間を置いて再度お試しください。");
      setState("error");
      return;
    }

    setState("success");
    formElement.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="name">
          お名前
        </label>
        <input
          required
          id="name"
          name="name"
          type="text"
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="千川 太郎"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="email">
          連絡先メールアドレス
        </label>
        <input
          required
          id="email"
          name="email"
          type="email"
          className="mt-1 w-full rounded border px-3 py-2"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700" htmlFor="message">
          お問い合わせ内容
        </label>
        <textarea
          required
          id="message"
          name="message"
          className="mt-1 w-full rounded border px-3 py-2"
          rows={5}
          placeholder="お問い合わせ内容をご記入ください。"
        />
      </div>

      <button
        type="submit"
        disabled={state === "submitting"}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
      >
        {state === "submitting" ? "送信中..." : "送信する"}
      </button>

      {state === "success" && (
        <p className="text-sm text-green-600">送信が完了しました。担当者からの返信をお待ちください。</p>
      )}
      {state === "error" && error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
