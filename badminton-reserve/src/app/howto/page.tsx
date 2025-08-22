export default function HowToUsePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">利用方法</h1>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">練習会への参加方法</h2>
        <ol className="list-decimal list-inside space-y-1">
          <li>
            マイページで練習イベント一覧にて表示される情報を入力してください。ニックネームを設定していない際にはLINEに登録してある名前が反映されます。
          </li>
          <li>トップページの練習日程から、参加したい練習日を選びます。</li>
          <li>
            定員に達していない場合には「参加する」ボタンが、すでに達している場合は「待機に入る」ボタンが表示されます。
          </li>
          <li>
            参加、待機をキャンセルする場合にはそれぞれ「キャンセル」「待機をキャンセル」ボタンを押してください。
          </li>
          <li>
            待機は参加者数が減ったときに自動で繰り上がります。その際に、本アカウントにて通知がきます。
          </li>
          <ul className="list-none pl-0">
            ※
            管理者に設定されていないユーザーが管理者用ページでイベント作成を行っても練習イベント一覧には反映されません。
          </ul>
        </ol>
      </section>
    </div>
  );
}
