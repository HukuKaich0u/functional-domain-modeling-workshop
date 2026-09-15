# Session 05: 開始承認の入力を境界で検証する

このディレクトリは Session 05 の開始スナップショットです。解答は `examples/session-06/src` にあります。

S4 で区別した ZoneId と SegmentId を、端末から届く文字列から作る境界を実装します。変更対象は `src/boundary/approveEvaInput.ts` の1ファイルです。

```bash
pnpm demo:05
pnpm --filter @moonbase/session-05 typecheck
pnpm --filter @moonbase/session-05 test
pnpm exercise:05
```

デモは `http://localhost:3000` で起動します。開始承認の route は、path parameter の許可番号と端末から届く系統区間を `ApproveEvaInput.parse` へ渡します。

`typecheck` と `test` は S3 と S4 の回帰を確認します。`exercise` は、不正な許可番号と不正な系統区間を拒否できない2件で意図的に失敗します。

## 時間外の補足

`src/boundary/spaceWeatherReport.ts` と `src/domain/worker/cumulativeDose.ts` は時間内の変更対象ではありません。宇宙天気の外部 JSON の検証と、累積線量を `Sensitive` で包む方法を比較したい場合は、解答側の session-06 と読み比べます。
