# Badminton Reserve

バドミントンサークルのイベント予約・管理Webアプリケーション

🔗 **https://badminton-reserve-j3w4.vercel.app/events**

## 機能

- イベント一覧表示（月別カレンダー形式）
- イベント参加・キャンセル
- LINE ログイン（NextAuth.js）
- マイページ（参加履歴・プロフィール）
- 管理者ページ（イベント作成・編集・削除）
- お問い合わせフォーム（SMTP メール送信）

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Next.js 15 (App Router) |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS 4 |
| 認証 | NextAuth.js v5 + LINE Login |
| データベース | Firebase (Firestore) |
| ホスティング | Vercel |
| メール送信 | Resend |
| アイコン | Lucide React |

## セットアップ

```bash
pnpm install
pnpm dev
```
