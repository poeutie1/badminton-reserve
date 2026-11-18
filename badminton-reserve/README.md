# Badminton Reserve

バドミントンサークルのイベント予約・管理Webアプリケーション

🔗 **https://badminton-reserve-j3w4.vercel.app/events**

## 機能

- イベント一覧表示（月別カレンダー形式）
- イベント参加・キャンセル
- 会員・ゲスト共通のキャンセル待ち（受付順で自動繰り上げ）
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

## 本番データを使わないローカル確認

Node.js 20、Firebase CLI、Java 21が必要です。このPCではJavaを `.local-tools/jre/` に配置し、
`emulator:local` から使用できます。

```bash
# ターミナル1：専用のFirestore Emulatorを起動
pnpm emulator:local

# ターミナル2：テストデータを準備してlocalhost:3000を起動
pnpm dev:local
```

`dev:local` は `demo-badminton-local` と `127.0.0.1:8080` に固定し、本番のサービスアカウント・
LINE認証情報を使用せず、LINE通知も送信しません。画面上部の「管理者で確認」「会員Aで確認」
「会員Bで確認」で操作ユーザーを切り替えられます。この確認用ログインは開発モードかつ専用の
ローカルDB接続時のみ有効です。`pnpm dev` は既存の `.env.local` を使う通常の開発起動です。

「キャンセル待ち確認用（満員）」と「ゲスト参加確認用（空きあり）」の2つのイベントを用意します。
テストデータを戻す場合は、Emulator起動中に `pnpm seed:local --reset` を実行します。

ゲストは管理者が登録します。満員なら会員と同じ待機列の末尾へ追加され、待機中は参加人数に
含みません。会員キャンセル・参加ゲスト削除・定員増加で、先頭から必要な人数だけ繰り上げます。
ゲストの繰り上げは登録した管理者へアプリ内通知とLINE通知を行います（ローカル確認ではアプリ内のみ）。

```bash
pnpm test
# Emulatorとローカルアプリの起動後：実ブラウザで確認
python3 tests/local_preview_flow.py
```
