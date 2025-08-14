export const metadata = { title: "使い方" };

export default function HowToUsePage() {
  return (
    <div className="prose">
      <h1>このアプリの使い方</h1>
      <ol>
        <li>LINEでログイン</li>
        <li>プロフィールを保存</li>
        <li>「練習イベント一覧」から参加／キャンセル</li>
      </ol>
    </div>
  );
}
