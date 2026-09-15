# Session 06: 失敗を値にする

このディレクトリは Session 06 の開始スナップショットです。解答は `examples/session-07/src` にあります。

```bash
pnpm demo:06
pnpm --filter @moonbase/session-06 typecheck
pnpm --filter @moonbase/session-06 test
pnpm exercise:06
```

デモは `http://localhost:3000` で起動します。開始承認の route は複数の例外を投げますが、端末側は許可なしだけを文言で catch するため、状態不正は 500 になります。

S5 の解答として、開始承認の route は `ApproveEvaInput.parse` を通った許可番号と系統区間だけをユースケースへ渡します。そのうえで、次の演習では許可なしと状態不正を Result として利用側へ返します。
