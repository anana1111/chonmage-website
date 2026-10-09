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

## 日付ごとのホームカード上書き

既存の `events.manual.json` に任意の `heroOverrides` オブジェクトを追加できます。キーは日本のカレンダー日付、値は `status`（open / ongoing / ended / closed）、`open`、`mainTime`、`mainTitle`、`latestText`、`latestUrl` です。時刻は HH:MM、MAIN は時刻・名称を一緒に入力、リンクは HTTPS または空欄です。

merge はこのマップを `events.json` に引き継ぎます。古いイベント手動設定が期限切れでも、未来日のカード設定は残ります。公開ページは日本時間の今日に一致するカードのみ適用し、他の日の自動更新を妨げません。ホームカードだけが対象で、イベント詳細・リングゲーム・News は変更しません。日付のキーを削除すると、その日は従来のデータと公式X案内へ戻ります。

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
- `events[].publishAt`：予約公開（任意）。日本時間の日時（例 `2026-10-10T18:00:00+09:00`）。この時刻まで公開ページに表示しません。`heroOverrides[日付].publishAt` も同じ意味です。判定は `publish-core.js`。
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
- `workflow_dispatch`、および main の `scripts/**` / `news-core.js` / `data/events.manual.json` / workflow の変更時

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

`news.json` は引き続き `{ "items": [...] }` を使用し、既存の `date` / `description` / `url` も読めます。新しい項目は `id`、`publishedAt`（JST）、`title`、`summary`、`content`、`image` / `images`、`source`（manual / x）、`sourceUrl`、`published`、`pinned`。分類と画像なしの visualLabel/theme も継続します。

`news-core.js` が表示期限・状態・ソート・入力検証を一元管理します。公開 ON、公開日時到達、公開から30日以内の NEWS のみ表示します。30日を超えた記録は Expired ですが削除しません。下書き・予約・掲載終了の詳細URLも本文を公開しません。日時のない古いレコードは日本時間の `date` で判断します。

同じ取得処理から保存した X snapshots は `scripts/sync-news.mjs` で最新の news.json に merge します。原投稿URLで重複を防ぎ、`autoUpdate: false` の手動編集は維持します。削除したX投稿のURLはトップレベルの `excludedSourceUrls` に残して再追加を防ぎます。失敗時・元投稿がなくなった時も既存の NEWS は保持します。画像はHTTPSのURLまたは `images/` / `assets/` の相対パスです。元の画像が消えた時は画像だけを隠し本文は保持します。

表示中（期限切れ以外）の NEWS に付いた X の写真（`pbs.twimg.com/media/...`）は、Actions が `scripts/news-images.mjs` で一度だけ `images/news/` にコピーし、news.json のURLを `images/news/x-<ID>.webp` に書き換えて一緒に commit します。X から WebP の medium（最大1200px、詳細ページ用）と small（最大680px、`x-<ID>-680.webp`、カード用）を受け取るので画像ツールは不要です。コピー済みのファイルは再利用し、ダウンロードに失敗した写真は X のURLのまま残ります。掲載終了した NEWS のためには新しくダウンロードしませんが、既にあるコピーはそのまま使います。

## 失敗時

JSON 読み込み失敗時や JavaScript が無効なときは、日付のない「公式Xをご確認ください」の表示になります（古い日付の予定を今日の予定として見せません）。開催日が日本の今日と一致しない場合も同じ表示です。

## week.json（周日程）

店铺每周日发一张下一周的日程图。Actions 用 GitHub Models（免费，使用 workflow 自带的 `GITHUB_TOKEN`）读图，结果存到 `data/week.json`（每天：日期、营业时间、是否有终日リングゲーム、活动的时间/名称/ENTRY/RENTRY）。当天的营业推文还没读到时，用 week.json 里今天那一行生成 `events.auto.json`；读到当天推文后以推文为准。读图结果不合理（日期不在那一周、时间格式不对等）时保留旧文件。手动修改：直接编辑本文件并 commit；想让 AI 重新读，手动运行 workflow 并勾选 `reread_week`。

### 表示时间段（`days[].cards`）和上传图片

- 每天可以有 `cards`：`[{ start, end, status, open, mainTime, mainTitle, latestText, latestUrl }]`。字段同 `heroOverrides`，另加显示的开始/结束时间（日本时间，`end` 不含，日付が変わるまでは `24:00`）。同一天的时间段不能重叠；不合格的时间段在前台直接忽略。
- 前台首页的营业卡片：当天 `heroOverrides` ＞ 当前时刻所在的 `cards` ＞ 自动显示。页面开着时每分钟自动切换。
- TODAY 区下方的「今週のスケジュール」直接显示 `week.json` 的七天；`week.json` 里没有今天及以后的日期时隐藏。
- 管理画面「週間スケジュール」可查看和编辑，并导出 `week.json`。
- 上传图片：放进 `data/week-upload/`（JPG / PNG / WebP）并 commit 会触发 Actions，`scripts/read-week-image.mjs` 读取最新 commit 的那张（8 天以内）。结果写成 `source: "upload"`，带 `image`、`imageSha256`、`uploadedAt`；同一张图不会重复读。比上传时间旧的 X 投稿不会覆盖它，更新的 X 投稿（下周的）会覆盖。
- 新读进来的一周会沿用旧 `week.json` 同一天、否则同一星期几的 `cards`。
