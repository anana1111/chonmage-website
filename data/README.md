# 開催情報・自動更新・手動上書き

公開サイトが読む正本は `data/events.json` と `data/news.json` です。フロントエンドはデータベース API を使いません。

## 開催情報の3ファイル

- `events.auto.json`：自動取得の候補データ。
- `events.manual.json`：スタッフの手動上書きだけを保存する差分。
- `events.json`：auto と manual を merge した公開用データ。公開サイトはこのファイルだけを読みます。

優先順位は **manual > auto > stale fallback** です。

同じ開催日では、`events.manual.json` の指定だけが auto を上書きします。手動で追加したイベントは `extraEvents`、自動イベントを非表示にした場合は event ID に対して `hidden: true` として保存します。`extraEvents` の ID が auto の ID と重複した場合は `-2` などを付けて両方残します（Actions のログに warning が出ます）。

手動で未来日の完全な予定を作った場合は `replacement` として保持され、auto が同じ日付まで追いついても手動予定を優先します。auto がそれより新しい日付になったときだけ、古い manual は自動的に効かなくなります。

merge は `scripts/schedule-core.mjs` の `mergeSchedule()` です。`scripts/merge-events.mjs`（Actions）と管理画面の書き出しは同じコードを使います。

## events.json の主な項目

- `date`：開催日（YYYY-MM-DD）
- `status`：`open` または `closed`
- `open` / `close`：OPEN / CLOSE（HH:MM）。`open` は営業日なら必須、休業日（`closed`）なら省略可。`close` は任意。
- 深夜：06:00 より前の時刻は前日の営業の続きとして扱います。`25時CLOSE` は `close: "01:00"` になり、日本時間 0:00 を過ぎても CLOSE までは当日の予定として表示します。
- `updatedAt`：自動取得の最終更新時刻。取得できていない場合は null のことがあります。
- `source`：情報源 URL と mode（seed / auto / merged / manual）
- `ringGame.start`：リング開始時刻。未指定なら OPEN を使用
- `events[].id`：auto/manual merge 用の安定 ID（空文字は不可、重複不可）
- `events[].type`：free / tournament / special / event（任意）
- `events[].theme`：blue / orange（任意。指定する場合はこのどちらか）
- `events[].end`：終了時刻（任意）。未指定のイベントは、次のイベント開始・CLOSE・開始から3時間のうち最も早い時刻まで NOW と表示します。
- `events[].isMain`：Hero の MAIN 候補。未指定なら最後の tournament / special。
- `events[].hidden`：管理画面の下書きで非表示にすると manual 差分へ変換（公開用 events.json には残りません）

OPEN / RING / CLOSE は公開時に timeline card として生成するため、通常は `events[]` に重複して書きません。

### 検証ルール

`scripts/schedule-core.mjs`（Node・Actions・管理画面）と `script.js` の `validateEvents()`（公開ページ）は同じルールです。`node scripts/test-browser.mjs` で両方に同じデータを通して一致を確認しています。

- 文字列項目は空にできません。管理画面の仮文言 `詳細を入力してください。` は公開できません。
- URL は `https://` のみ（イベントのリンクは `tel:` も可）。
- `news.json` の `theme` は schedule / event / result。

## 自動更新

`.github/workflows/update-events.yml` の実行時刻（日本時間）：

- 毎日 09:07 / 12:07 / 13:07 / 15:07
- 平日 16:17〜19:47（30分ごと。17:00 OPEN 前後の当日投稿に合わせる）
- 土日 11:17〜13:47（30分ごと。13:00 OPEN 前後）
- `workflow_dispatch`、および main の `scripts/**` / `data/events.manual.json` / workflow の変更時

処理順：

1. データロジックのテスト
2. 公式 X の公開情報を best-effort で取得
3. 取得できた場合だけ `events.auto.json` を更新
4. manual を auto より優先して merge
5. `events.json` / `news.json` を validate
6. 実データに差分がある場合だけ commit。push 前に最新の main を取り込み、その時点の `events.manual.json` で merge し直します（実行中にアップロードされた手動データを上書きしません）。

X が HTTP 403 / 429、タイムアウト、形式変更、当日の Schedule を十分な確度で識別できない場合は **既存の events.auto.json / events.json を消しません**。当日データが作れなければ、公開サイト側の日本時間 stale fallback が公式 X への案内を表示します。

自動取得は ① X syndication、② X profile HTML、③ Jina Reader 経由の公開ページ、④ Twiiit が案内する Nitter RSS、の順で best-effort に試します。X Developer API key は使いません。Jina Reader と Twiiit/Nitter は第三者サービスの無料 fallback としてだけ使い、API key は保存しません。

解析のルール：

- 投稿は行単位で読みます（取得時に改行を保持します）。
- 形式が崩れた投稿が1件あっても処理は止まらず、その投稿だけを飛ばして次の投稿を試します。
- `2日(金)17時OPEN` のような月省略日付は、日と曜日の両方が日本の今日と一致するときだけ受け付けます。
- `17時半`・`19時10分`・`25時CLOSE`・`17:00〜25:00` などの時刻表記に対応します。`3時間` のような時間の長さは時刻として扱いません。
- 当日の欄に `休業` / `定休日` / `臨時休` / `お休み` があり OPEN 時刻がない投稿は `status: "closed"` になります。複数日の投稿は当日の日付の行だけを読みます。
- 自動生成 ID が重複した場合は `-2` などを付けます。

## 手動更新

通常は `/admin/` を開いて編集してください。管理画面は現在の `events.json`、`events.auto.json`、`events.manual.json` を読み、各 events フィールドを AUTO / MANUAL と表示します。

「公開用ファイルを作成」で次を出力します（この時点ではまだ公開されません）。

- `events.json`（merge-events.mjs と同じ結果）
- `events.manual.json`
- `news.json`

GitHub Pages の静的サイトなので、ブラウザには GitHub token を保存しません。ダウンロードした3ファイルを GitHub の `data/` にアップロードして commit すると公開されます。`events.manual.json` の commit で Actions も動き、merge と validate をやり直します。

## News

`news.json` は引き続き既存構造を使用します。Schedule / Event / Result の分類を保ち、公開サイトは `data/news.json` のみを読みます。

## 失敗時

JSON 読み込み失敗時や JavaScript が無効なときは、日付のない「公式Xをご確認ください」の表示になります（古い日付の予定を今日の予定として見せません）。開催日が日本の今日と一致しない場合も同じ表示です。
