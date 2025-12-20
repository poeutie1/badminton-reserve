This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## お問い合わせフォームのメール設定

`/contact` から送信された問い合わせは Gmail などの SMTP 経由で送信します。以下の環境変数を設定してください。

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=youraddress@gmail.com            # Gmail アドレス
SMTP_PASS=xxxxxxxxxxxxxxxx                 # 2段階認証のアプリパスワード
CONTACT_EMAIL_FROM=youraddress@gmail.com   # 送信元（SMTP_USER と同じでOK）
CONTACT_EMAIL_TO=owner@example.com         # 受信したいアドレス
```

`SMTP_PASS` は Gmail の場合、2段階認証を有効にしたうえでアプリパスワードを発行してください。ローカル開発では `.env.local`、本番では `.env.production.local` などに追加し、`pnpm dev` / `pnpm build` を再実行してください。
