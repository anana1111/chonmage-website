# CHONMAGE DAILY SCHEDULE MANAGER

公開後の `/admin/` で TODAY / NEWS を編集できます。静的 GitHub Pages 上のツールなので、認証や GitHub への直接書き込みは行いません（ファイルの作成まで。アップロードと commit は手動です）。

## AUTO / MANUAL

管理画面は公開中の `events.json` に加えて `events.auto.json` と `events.manual.json` を読みます。

events の各フィールドには AUTO / MANUAL バッジが表示されます。自動値と同じなら AUTO、変更されていれば MANUAL です。

- **自動値に戻す**：そのフィールドだけ自動取得値へ戻す。
- **自動データに戻す**：開催情報全体を現在の auto データへ戻す。
- イベントの **複製**：新しい manual event ID を付けてコピー。
- **前台で非表示**：auto event を削除せず、manual override で非表示にする。

## 編集できる開催情報

- 開催日 / 営業状態 / OPEN / CLOSE
- 公式 X / 当日の投稿
- Ring START / タイトル / 説明
- EVENT / TOURNAMENT / FREE ROLL
- event type / Hero MAIN 候補 / 表示・非表示
- tags / facts / link
- NEWS

イベント配列の並び替えボタンは編集時の見やすさ用です。公開側 timeline は時刻で自動ソートします。

## Draft

「下書きを保存」はブラウザの localStorage に events / news を保存します。未完成データでも下書き保存できますが、validation を通らない内容は preview / export できません。

公開データへ Reset 中に編集が発生した場合は reset を中止し、編集中データと保存済み下書きを保護します。

## Live Preview

iframe は実際の公開サイトの renderer / CSS を `?preview=1` で再利用します。通常の公開ページは preview message を受けません。same-origin parent だけが下書きを送れます。

390 / 768 / 1440 / Full の実幅プレビューと、「開催日として表示」「実際の日付判定」を切り替えられます。

## Export / 公開用ファイルを作成

「公開用ファイルを作成」（または「JSONを書き出す」）は validation 後に次の3ファイルを copy / download できるようにするだけで、**サイトへは自動で公開・アップロードしません**。

- `events.json`：`events.auto.json` に手動差分を merge した完成版。`scripts/merge-events.mjs`（GitHub Actions）と同じ `scripts/schedule-core.mjs` の `mergeSchedule()` で作るので、Actions が作る結果と一致します。非表示にしたイベントは含まれません。
- `events.manual.json`：auto に対する手動 override
- `news.json`

公開するには、ダウンロードした3ファイルを GitHub の `data/` アップロード画面で同名ファイルと置き換えて commit してください。commit 後に GitHub Pages が再公開し、`events.manual.json` の変更で Actions も merge / validate をやり直します。

開催日が `events.auto.json` より古い場合は、その手動データが公開時に使われないため書き出しを止めます。

## Validation

公開ページ（`script.js`）と Node / Actions（`scripts/schedule-core.mjs`）の両方の検証を通った内容だけ preview / export できます。新しく追加したイベントの説明は空欄から始まり、仮文言「詳細を入力してください。」のままでは書き出せません。休業日は OPEN を空欄にできます。

今後安全な GitHub OAuth / serverless backend を接続できるよう、直接 token をフロントエンドへ埋め込む設計にはしていません。

管理画面には `noindex,nofollow` が設定されていますが、これは認証ではありません。秘密情報は保存しないでください。
