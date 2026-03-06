"use client";

import Link from "next/link";
import { register } from "@/lib/actions/auth";
import { useActionState } from "react";

export default function RegisterPage() {
  const [error, action, isPending] = useActionState(async (_: string | null, formData: FormData) => {
    try {
      await register(formData);
      return null;
    } catch (e: unknown) {
      return e instanceof Error ? e.message : "登録に失敗しました";
    }
  }, null);

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <span
            className="inline-flex items-center justify-center w-12 h-12 rounded-xl text-xl font-bold mb-4"
            style={{ background: 'var(--vermillion)', color: '#fff', fontFamily: 'var(--font-display)' }}
          >
            就
          </span>
          <h1
            className="text-xl tracking-wide"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--ink)' }}
          >
            新規登録
          </h1>
        </div>

        <div className="card p-6">
          <form action={action} className="space-y-4">
            <div>
              <label className="form-label">名前（任意）</label>
              <input
                name="name"
                type="text"
                className="form-input"
                placeholder="山田 太郎"
              />
            </div>
            <div>
              <label className="form-label">メールアドレス</label>
              <input
                name="email"
                type="email"
                required
                className="form-input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="form-label">パスワード（8文字以上）</label>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                className="form-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm" style={{ color: 'var(--vermillion)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="btn-primary w-full justify-center mt-2"
            >
              {isPending ? "登録中..." : "アカウント作成"}
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-sm" style={{ color: 'var(--ink-faint)' }}>
          既にアカウントをお持ちの方は{" "}
          <Link href="/login" className="underline" style={{ color: 'var(--vermillion)' }}>
            ログイン
          </Link>
        </p>
      </div>
    </div>
  );
}
