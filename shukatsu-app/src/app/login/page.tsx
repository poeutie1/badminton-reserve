import Link from "next/link";
import { login } from "@/lib/actions/auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
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
            ログイン
          </h1>
        </div>

        <div className="card p-6">
          <form action={login} className="space-y-4">
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
              <label className="form-label">パスワード</label>
              <input
                name="password"
                type="password"
                required
                className="form-input"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center mt-2">
              ログイン
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-sm" style={{ color: 'var(--ink-faint)' }}>
          アカウントをお持ちでない方は{" "}
          <Link href="/register" className="underline" style={{ color: 'var(--vermillion)' }}>
            新規登録
          </Link>
        </p>
      </div>
    </div>
  );
}
