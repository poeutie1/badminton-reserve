export default function HowToUsePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">利用方法</h1>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">練習会への参加方法</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            トップページの練習日程から、参加したい練習日をクリックします。
          </li>
          <li>右側に表示される詳細情報を確認します。</li>
          <li>「参加表明する」ボタンをクリックします。</li>
          <li>
            表示されたポップアップに自分の名前を入力し、「確定する」ボタンを押します。
          </li>
          <li>
            定員に達していない場合は参加者リストに、達している場合はキャンセル待ちリストに名前が追加されます。
          </li>
        </ol>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">管理者の方へ</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            トップページ右上の「管理者ログイン」ボタンから、指定されたパスワードでログインします。
          </li>
          <li>管理者パネルが表示されます。</li>
          <li>練習日程で練習会を作成したい日付を選択します。</li>
          <li>
            定員を入力し、「作成する」ボタンを押すと、新しい練習会が練習日程に登録されます。
          </li>
        </ol>
      </section>
    </div>
  );
}
