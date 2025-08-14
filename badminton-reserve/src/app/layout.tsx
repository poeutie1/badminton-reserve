import "./globals.css";
import Link from "next/link";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-sky-50">
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
            <li>
              <Link href="/youtube">YouTubeリンク</Link>
            </li>
          </ul>
        </nav>
        <main className="mx-auto max-w-4xl p-4">{children}</main>
      </body>
    </html>
  );
}
