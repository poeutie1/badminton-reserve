import "./globals.css";
import Link from "next/link";
import SessionUpserter from "./events/_components/SessionUpserter";
import { Providers } from "./providers";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteVerification =
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "";

  return (
    <html lang="ja">
      <head>
        {siteVerification && (
          <meta
            name="google-adsense-account"
            content="ca-pub-9264651168388030"
          />
        )}
      </head>
      <body className="min-h-screen bg-sky-50">
        <Providers>
          {/* ログイン中のみ /api/me/upsert を一度だけ叩く */}
          <SessionUpserter />

          <nav className="sticky top-0 bg-white border-b">
            <ul className="mx-auto max-w-4xl flex gap-4 p-3 text-sm">
              <li>
                <Link href="/mypage">マイページ</Link>
              </li>
              <li>
                <Link href="/events">練習イベント一覧</Link>
              </li>
              <li>
                <Link href="/howto">使い方</Link>
              </li>
              <li>
                <Link href="/admin">管理者用ページ</Link>
              </li>
              <li className="ml-auto">
                <Link href="/login">ログイン</Link>
              </li>
            </ul>
          </nav>

          <main className="mx-auto max-w-4xl p-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
