# Session 07: 副作用を外に出す

このディレクトリは Session 07 の開始スナップショットです。S6 の同期 `approveEva` と `Result` の回帰契約を保ったまま、S7 用の `approveEvaWithEffects` に残した非決定値と二重書き込みを観察します。`EvaPermit.approve(context)(requested, input)` はドメイン側へ配布済みで、演習では `src/useCase` だけを編集します。解答は `examples/session-08/src/useCase` にあります。

```bash
pnpm demo:07
pnpm --filter @moonbase/session-07 typecheck
pnpm --filter @moonbase/session-07 test
pnpm exercise:07
```

デモは `http://localhost:3000` で起動し、`approveEvaWithEffects` の非決定値と2回書き込みを実際の route から実行します。

`typecheck` と `test` は成功します。`exercise` は `approveEvaWithEffects` にある `Date` / `randomUUID` の直接呼び出しと、状態・作業記録の2回書き込みを4件の業務名付き assertion failure として再現します。S6 の `approveEva` は変更せず、S7 の効果付き経路だけを改善します。
