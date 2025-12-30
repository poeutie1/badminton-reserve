export default function PrivacyPolicyPage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">プライバシーポリシー</h1>
      <section className="space-y-3 text-sm text-gray-700">
        <p>
          当サイトでは、第三者配信の広告サービス（Google AdSense）を利用しています。
        </p>
        <p>
          広告配信事業者は、ユーザーの興味に応じた広告を表示するため、Cookie（クッキー）を使用することがあります。
        </p>
        <p>
          Googleによる広告で使用されるCookieの詳細や、パーソナライズ広告を無効にする方法については、
          <a
            className="ml-1 underline"
            href="https://adssettings.google.com"
            target="_blank"
            rel="noreferrer"
          >
            https://adssettings.google.com
          </a>
          をご確認ください。
        </p>
        <p>
          当サイトでは、お問い合わせの際に取得した個人情報を、回答目的以外で利用することはありません。
        </p>
      </section>
    </div>
  );
}
