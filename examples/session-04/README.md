# Session 04: 開始承認の識別子を型で区別する

このディレクトリは Session 04 の開始スナップショットです。解答は `examples/session-05/src` にあります。

S2 で決めた「どの区画を、どの系統区間を遮断して承認するか」という入力を扱います。PermitId と WorkerId は用途別の型として配布済みです。これらを手本に、ZoneId と SegmentId を区別し、作業許可の状態と `approve` まで同じ型を使います。

```bash
pnpm demo:04
pnpm --filter @moonbase/session-04 typecheck
pnpm --filter @moonbase/session-04 test
pnpm exercise:04
```

デモは `http://localhost:3000` で起動します。

`typecheck` と `test` は S3 の回帰を確認します。`exercise` は次の3段が未実装であることを示します。

1. ZoneId と SegmentId を相互に代入できる
2. 作業許可の状態と `approve` に string が残っている
3. 取り違えを止める型テストがない

PermitId と WorkerId をさらに比較したい場合は、時間外の補足として `src/domain/permit/permitId.ts` と `src/domain/worker/workerId.ts` を読みます。
