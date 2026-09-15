# Session 03: 状態を型にする

このディレクトリは Session 03 の開始スナップショットです。解答は `examples/session-04/src` にあります。

完了・中止した作業許可を承認へ戻せず、帰還の記録前には完了にできず、中止には理由を残すという不変条件を、`src/domain/permit/` で型にします。

```bash
pnpm demo:03
pnpm --filter @moonbase/session-03 test
pnpm exercise:03
```

デモは `http://localhost:3000` で起動します。画面操作はこの starter の遷移関数を呼びます。

`pnpm exercise:03` は5つの型要件について、意図した失敗で始まります。
