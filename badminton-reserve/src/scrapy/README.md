# 体育館の自動予約

毎月1日9時に、翌月のふるさと千川館・多目的ホールを最大5日予約します。
月〜木の優先順位と週の分散は維持します。

```sh
# 確認画面まで動作確認する。申込はしない。
./run_auto_reserve.sh --dry-run --headless

# 通常実行。実際に予約を申し込む。
./run_auto_reserve.sh --headless
```

`--test` は翌月の「ふるさと千川の部屋」で確認画面まで進み、申込せずに終了します。
認証情報は同じディレクトリの `.env` に `LOGIN_ID` / `LOGIN_PASSWORD` を設定します。

実行用スクリプトは `.venv`、MacのPython 3.12、`python3` の順に選択します。
`BADMINTON_PYTHON` で明示的な指定もできます。新しい環境では、選んだPythonで
`-m pip install -r requirements.txt` と `-m playwright install chromium` を実行してください。
Playwright用のChromiumがないMacでは、インストール済みのGoogle Chromeを使用します。

自動実行は `com.satorio.badminton-reserve` のlaunchdジョブ1つを使用します。
cronに同じ処理を追加しないでください。起動が重なった場合はファイルロックで後続をスキップします。
標準出力・標準エラーは `diag/launchd_stdout.log` / `diag/launchd_stderr.log` に保存します。

画面遷移後は、新しい画面と必要な要素の出現を確認します。確認済みの日付は同じ実行中に
再確認せず、カレンダーの月設定が変わっていなければ再表示もしません。
申込後の結果が不明な場合は、再試行せず停止します。施設サイトの予約照会で確認してください。

回帰テストは外部への全リクエストをローカルの模擬画面で応答し、実際の予約を行いません。
`pytest` とGoogle Chromeがある環境で、プロジェクトルートから実行します。

```sh
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m pytest -q src/scrapy/test/test_auto_reserve.py
```

2026年11月17日の実サイトでのdry-runでは、翌月の10候補を17.73秒で確認し、
ログイン1回・途中の再ログイン0回で終了しました。希望3枠が揃う日はなく、申込は0件です。
確認画面への進行・申込の停止・結果不明時の停止はオフラインの回帰テストで確認します。
