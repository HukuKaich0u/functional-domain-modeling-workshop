---
created: 2026-09-15
author: Koki Aoyagi
type: runbook
---

# 移植の作業表

`fp-with-ts-hands-on` を fork したツリーを、MoonBase の教材へ書き換える
ための対応表と作業順。ドメインの中身は [ドメイン仕様](./domain-spec.md)
を正とする。

## 名前の対応

| 元 | 新 | 備考 |
| --- | --- | --- |
| `@fp-with-ts/docs` | `@moonbase/docs` | 教材サイト |
| `@fp-with-ts/clinic-web`（`packages/clinic-web`） | `@moonbase/base-web`（`packages/base-web`） | 画面の共通パッケージ |
| `@fp-with-ts/clinic-session-NN` | `@moonbase/session-NN` | スナップショット |
| `@fp-with-ts/clinic-final` | `@moonbase/final` | 参照実装 |
| `@fp-with-ts/start-examination-continuity` | `@moonbase/approve-eva-continuity` | 横断テスト |
| `clinicFixture`（`examples/fixtures/clinic.ts`） | `moonbaseFixture`（`examples/fixtures/moonbase.ts`） | |
| `clinic.sqlite` | `moonbase.sqlite` | `.gitignore` も直す |
| `wrangler.jsonc` の `name` | `functional-domain-modeling-workshop` | 旧 slug へのリダイレクトは削除 |
| `WAN NYAN CLINIC` / `WAN NYAN OS` | `MoonBase` / `MoonBase 作業管理` | 画面とページの表記 |

## スナップショットの対応

| 元 | 新 | 内容 |
| --- | --- | --- |
| `session-00` | `session-00` | 旧コード |
| なし | `session-01` | 承認条件の10通り。新規 |
| `session-01` | `session-02` | EventStorming が読む旧コード |
| `session-02` | `session-03` | 状態と遷移の開始コード |
| `session-03` | `session-04` | 識別子の開始コード |
| `session-04` | `session-05` | 境界の開始コード |
| `session-05` | `session-06` | 失敗の開始コード |
| `session-06` | `session-07` | 副作用の開始コード |
| `session-07` | `session-08` | 全解答 |
| `final` | `final` | 参照実装 |

`pnpm demo:NN`、`pnpm exercise:NN` の番号も新に合わせる。演習コマンドは
`exercise:03`〜`exercise:07` の5つ。

## ページ slug の対応

| 元 | 新 |
| --- | --- |
| `00-system-handover` | `00-system-handover` |
| なし | `01-design-approaches` |
| `01-business-events-and-workflows` | `02-business-events-and-workflows` |
| `02-state-transitions` | `03-state-transitions` |
| `03-semantic-identifiers` | `04-semantic-identifiers` |
| `04-boundaries-and-pii` | `05-boundaries-and-sensitive-data` |
| `05-workflow-errors` | `06-workflow-errors` |
| `06-effects-and-consistency` | `07-effects-and-consistency` |
| `final` | `final` |

`apps/docs/src/sessions/navigation.ts`、`types.ts` の `sequence`、
`ExampleSnapshot`、`docs/event/*` の番号をすべて追従させる。

## ドメイン語彙の対応

| 元 | 新 |
| --- | --- |
| `Appointment` / `appointment` | `EvaPermit` / `permit` |
| `Scheduled` `CheckedIn` `InExamination` `AwaitingPayment` `Paid` `Canceled` | `Requested` `Approved` `Outside` `Returned` `Closed` `Aborted` |
| `startExamination` | `approveEva` |
| `checkIn` `completeExamination` `recordPayment` `cancel` | `egress` `returnToBase` `close` `abort` |
| `ExaminationStarted` | `EvaApproved` |
| `AppointmentId` `VeterinarianId` | `ZoneId` `SegmentId`（用途の対応。`PermitId` は集約の識別子） |
| `PetId` `OwnerId` `ExamId` | `PermitId` `WorkerId`（配布済みの手本） |
| `ownerContact`（`Sensitive`） | `CumulativeDose`（`Sensitive<number>`） |
| `ExamResult`（外部JSONの検証例） | `SpaceWeatherReport` |
| `AppointmentNotFound` `InvalidAppointmentState` `AppointmentConflict` | `PermitNotFound` `InvalidPermitState` `PermitConflict` |
| `AppointmentResolver` `ExaminationStartedStore` | `PermitResolver` `EvaApprovedStore` |
| `src/domain/appointment/` | `src/domain/permit/` |

## 作業順

1. fork 直後に `pnpm install`、`pnpm typecheck`、`pnpm test`、`pnpm build`
   を通し、元教材のままで GREEN を確認する
2. パッケージ名、ディレクトリ名、スナップショット番号、slug を一括で
   付け替え、再び GREEN を確認する。内容はまだ動物病院のまま
3. `examples/fixtures` と `examples/session-08`（全解答）を仕様どおりに
   書き換える。回帰テストと型フィクスチャも新語彙にする
4. `session-07` から `session-03` へ逆順に、前の回の解答からその回の
   欠陥だけを戻して開始コードを作る。`exercises/*.test.ts` の RED を確認する
5. `session-00` と `session-02` の旧コードを書く。事故を再現するデモ操作
   5種類を置く
6. `session-01`（10通り）と `final` を作る
7. `apps/docs` のページを、企画方針、規程、事故報告書から書く。S1 の
   ページを新設する
8. デザインを差し替える
9. `docs/event` を書き直す

各段階の終わりで `pnpm typecheck` と `pnpm test` を通す。段階2までは
元教材の全テストがそのまま通ることを基準にする。

## 検証コマンド

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```
