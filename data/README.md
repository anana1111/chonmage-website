# 開催情報・自動更新・手動上書き

公開サイトが読む正本は `data/events.json` と `data/news.json` です。フロントエンドはデータベース API を使いません。

## 開催情報の3ファイル

- `events.auto.json`：自動取得の候補データ。
- `events.manual.json`：スタッフの手動上書きだけを保存する差分。
- `events.json`：auto と manual を merge した公開用データ。公開サイトはこのファイルだけを読みます。

優先順位は **manual > auto > stale fallback** です。

同じ開催日では、`events.manual.json` の指定だけが auto を上書きします。手動で追加したイベントは `extraEvents`、自動イベントを非表示にした場合は event ID に対して `hidden: true` として保存します。

手動で未来日の完全な予定を作った場合は `replacement` として保持され、auto が同じ日付まで追いついても手動予定を優先します。auto がそれより新しい日付になったときだけ、古い manual は自動的に効かなくなります。

## events.json の主な項目

- `date`：開催日（YYYY-MM-DD）
- `open` / `close`：OPEN / CLOSE（HH:MM、close は任意）
- `status`：`open` または `closed`
- `updatedAt`：自動取得の最終更新時刻。取得できていない場合は null のことがあります。
- `source`：情報源 URL と mode（seed / auto / merged / manual）
- `ringGame.start`：リング開始時刻。未指定なら OPEN を使用
- `events[].id`：auto/manual merge 用の安定 ID
- `events[].type`：free / tournament / special / event
- `events[].isMain`：Hero の MAIN 候補
- `events[].hidden`：管理画面の下書きで非表示にすると manual 差分へ変換

OPEN / RING / CLOSE は公開時に timeline card として生成するため、通常は `events[]` に重複して書きません。

## 自動更新

`.github/workflows/update-events.yml` は日本時間 09:00 / 12:00 / 15:00 / 17:00 相当の cron と `workflow_dispatch` を持ちます。

処理順：

1. データロジックのテスト
2. 公式 X の公開情報を best-effort で取得
3. 取得できた場合だけ `events.auto.json` を更新
4. manual を auto より優先して merge
5. `events.json` を validate
6. 実データに差分がある場合だけ commit

X が HTTP 403 / 429、タイムアウト、形式変更、当日の Schedule を十分な確度で識別できない場合は **既存の events.auto.json / events.json を消しません**。当日データが作れなければ、公開サイト側の日本時間 stale fallback が公式 X への案内を表示します。

自動取得は X の公開ページ / 埋め込み用公開データへの best-effort アクセスで、X Developer API key は使いません。X 側の rate limit により取得できない回があることを前提に設計しています。

## 手動更新

通常は `/admin/` を開いて編集してください。管理画面は現在の `events.json`、`events.auto.json`、`events.manual.json` を読み、各 events フィールドを AUTO / MANUAL と表示します。

公開準備では次を出力します。

- `events.json`
- `events.manual.json`
- `news.json`

GitHub Pages の静的サイトなので、ブラウザには GitHub token を保存しません。ダウンロードした manual / final JSON を GitHub の `data/` に反映して commit してください。

## News

`news.json` は引き続き既存構造を使用します。Schedule / Event / Result の分類を保ち、公開サイトは `data/news.json` のみを読みます。

## 失敗時

JSON 読み込み失敗時も HTML の静的 fallback は残ります。開催日が日本の今日と一致しない場合は昨日のイベントを「今日」として表示せず、公式 X への案内を表示します。
