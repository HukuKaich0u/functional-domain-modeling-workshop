# Session 01: 開始承認の7条件を10通りに書く

船外作業規程 第2条・第10条の開始承認の条件を、同じ入力と同じ判定結果に対して10通りの書き方で実装した比較用のスナップショットです。Web アプリは持ちません。

| # | 書き方 | ファイル | 扱い |
| --- | --- | --- | --- |
| 1 | 手続き型 | `src/approaches/01-procedural.ts` | 比較 |
| 2 | オブジェクト指向 | `src/approaches/02-object-oriented.ts` | 比較 |
| 3 | 関数型 | `src/approaches/03-functional.ts` | 主題 |
| 4 | 型駆動 | `src/approaches/04-type-driven.ts` | 主題 |
| 5 | データ指向（Data-Oriented Programming） | `src/approaches/05-data-oriented.ts` | 比較 |
| 6 | 宣言型・ルールベース | `src/approaches/06-rule-based.ts` | 比較 |
| 7 | イベント駆動 | `src/approaches/07-event-driven.ts` | 比較 |
| 8 | メッセージ指向・Actor Model | `src/approaches/08-actor-model.ts` | 展望 |
| 9 | Reactive Programming | `src/approaches/09-reactive.ts` | 展望 |
| 10 | Logic Programming | `src/approaches/10-logic-programming.ts` | 展望 |

入力 `ApprovalRequest`、7つの却下理由 `RejectionReason`、判定結果 `Verdict` は `src/approval/request.ts` で共有します。`test/approaches.test.ts` は10通りすべてに同じ申請を渡し、承認できる申請と、条件が1つずつ破れた申請の結果が一致することを確かめます。複数の条件が同時に破れたときの報告範囲だけは書き方ごとに宣言し（`reporting`）、その宣言どおりであることを確かめます。

```bash
pnpm demo:01
pnpm --filter @moonbase/session-01 test
```
