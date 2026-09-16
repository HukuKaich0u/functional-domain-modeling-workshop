# Session 08: S3〜S7演習解答の統合スナップショット

S3〜S7 の演習範囲の解答と回帰テストを統合した、非公開スナップショットです。開始承認の7条件を外部のResolverからすべて照合する参照実装は `examples/final` にあります。このスナップショットでは、条件6は `SegmentId` を必須入力として表すところまでを扱い、遮断札の現在状態と許可番号の照合は扱いません。S6 の同期 `approveEva` は `Result` の契約を維持し、S7 の `approveEvaWithEffects` は `ResultAsync` と `andThrough` で効果を接続します。`Clock`（地球時と月面日）と `EventIdGenerator` で非決定値を外へ出し、状態と作業記録を `store(event)` 1回で保存します。

許可なし、状態不正、酸素不足、作業後の被ばく量が安全上限を超える、フレア警報中、夜間、許可の競合は、利用側が判断できる業務上の失敗として `Result` の `Err` に残します。保存障害や破損データは業務上の失敗ではないため、catch して `Err` へ詰め直しません。外側のアプリケーション境界で安全な情報だけを記録し、詳細を含まない 500 応答へ変換します。

被ばく量は医務の `CrewExposureResolver` から `Sensitive<number>` で受け取り、承認の判定にだけ使います。作業許可の状態、イベント、作業記録の payload には載せません（船外作業規程 第8条）。

```bash
pnpm demo:08
pnpm --filter @moonbase/session-08 typecheck
pnpm --filter @moonbase/session-08 test
```

デモは `http://localhost:3000` で起動し、Clock・EventIdGenerator・原子的な `store(event)` を注入した到達点を操作できます。
