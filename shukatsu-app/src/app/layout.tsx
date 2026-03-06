import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";

export const metadata: Metadata = {
  title: "就活管理アプリ",
  description: "企業情報・選考・ES/感想ログを一元管理",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;600;700;800&family=Zen+Kaku+Gothic+New:wght@300;400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="header-nav">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-3 group"
            >
              <span
                className="flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold tracking-tight"
                style={{
                  background: 'var(--vermillion)',
                  color: '#fff',
                  fontFamily: 'var(--font-display)',
                }}
              >
                就
              </span>
              <span
                className="text-lg tracking-wider text-white/90 group-hover:text-white transition-colors"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 600 }}
              >
                就活管理
              </span>
            </Link>
            <div className="flex items-center gap-3">
              {session?.user ? (
                <>
                  <span className="text-sm text-white/70 hidden sm:block">
                    {session.user.name || session.user.email}
                  </span>
                  <Link href="/companies/new" className="btn-accent text-sm">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    企業追加
                  </Link>
                  <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
                    <button
                      type="submit"
                      className="text-sm text-white/60 hover:text-white/90 transition-colors px-2 py-1"
                    >
                      ログアウト
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="btn-accent text-sm">
                  ログイン
                </Link>
              )}
            </div>
          </div>
        </header>
        <main className="max-w-5xl mx-auto px-6 py-8 animate-page-in">
          {children}
        </main>
      </body>
    </html>
  );
}
