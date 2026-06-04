# Badminton Reserve

バドミントンサークルのイベント予約・管理Webアプリケーション

## 概要

サークルメンバーがLINEログインでイベントに参加・キャンセルできる予約管理システムです。
管理者はイベントの作成・編集・削除、メンバー管理を行えます。

## 主な機能

- イベント一覧表示（月別カレンダー形式）
- イベント参加・キャンセル（キャンセル待ち対応）
- LINE ログイン
- マイページ（参加履歴・プロフィール）
- 管理者ページ（イベント作成・編集・削除）
- お問い合わせフォーム（メール送信）
- 施設の自動予約スクリプト（Playwright）

## 使用技術

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript / Python
- **スタイリング**: Tailwind CSS 4
- **認証**: NextAuth.js v5 + LINE Login
- **データベース**: Firebase (Firestore)
- **ホスティング**: Vercel
- **自動予約**: Playwright + GitHub Actions

## ディレクトリ構成

```
badminton-reserve/
├── src/
│   ├── app/          # ページ・APIルート
│   ├── firebase/     # Firebase設定・Cloud Functions
│   ├── lib/          # ユーティリティ
│   ├── scrapy/       # 施設自動予約スクリプト (Python)
│   └── types/        # 型定義
├── middleware.ts
├── next.config.ts
└── package.json
```

## セットアップ

```bash
cd badminton-reserve
pnpm install
pnpm dev
```

環境変数は `.env.local` に設定してください（`.env.example` 参照）。
