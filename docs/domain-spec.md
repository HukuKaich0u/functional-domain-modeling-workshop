---
created: 2026-09-15
updated: 2026-09-15
author: Koki Aoyagi
type: design
---

# ドメイン仕様: 船外作業許可

教材の全スナップショットが共有する、船外作業許可（`EvaPermit`）の型、
操作、失敗、記録、依存の定義。各セッションの開始コードと解答はこの仕様に
合わせる。

世界の設定と規程は [企画方針](../functional-domain-modeling-workshop.md)、
[船外作業規程](./world/eva-regulations.md)、
[事故報告 第1号](./world/incident-report-01.md) を正とする。

## 簡略化

- 教材で扱う船外作業はすべて電気設備の接続作業とし、遮断札を常に必須に
  する。規程第2条6項の「電気作業なら」の分岐はコードに持たない。
- 作業員の装備点検は、承認の入力として2名分の点検記録を受け取る形にする。
  点検済みを独立した状態にはしない。
- 酸素残時間は装備点検記録に含める。
- S3〜S8の演習スナップショットでは、条件6は `SegmentId` を必須入力にする
  ところまで扱う。遮断札の現在状態と許可番号の照合はFinal参照実装で行う。

## 識別子

| 型 | 書式 | 例 | 配布時点 |
| --- | --- | --- | --- |
| `PermitId` | `EVA-` + 4桁 | `EVA-0412` | S4 開始時点で配布済み（手本） |
| `WorkerId` | `W-` + 2桁 | `W-03` | S4 開始時点で配布済み（手本） |
| `ZoneId` | `PV-` + 2桁 | `PV-07` | S4 で参加者が作る |
| `SegmentId` | `PV-` + 2桁 | `PV-07` | S4 で参加者が作る |
| `EventId` | UUID | | S7 で配布 |

`ZoneId` と `SegmentId` は同じ書式で、値も同じ文字列になることが多い。
区別するのは値の形式ではなく用途で、取り違えると遮断していない区間で
作業することになる。

```ts
const schema = z.string().regex(/^PV-\d{2}$/).brand<"ZoneId">();
export type ZoneId = z.infer<typeof schema>;
export const ZoneId = { schema, parse: schema.parse } as const;
```

## 状態

6状態。`kind` で判別する。共通項目は `permitId`、`zoneId`、`crew`、
`plannedMinutes`、`requestedAt`。

| kind | 日本語 | 固有の項目 |
| --- | --- | --- |
| `Requested` | 申請済 | なし |
| `Approved` | 承認済 | `segmentId`、`equipmentChecks`、`approvedAt`、`approvedBy` |
| `Outside` | 作業中 | 承認済の項目 + `egressAt` |
| `Returned` | 帰還済 | 作業中の項目 + `returnedAt`、`returnRecord` |
| `Closed` | 完了 | 帰還済の項目 + `lockoutRemovedAt`、`closedAt` |
| `Aborted` | 中止 | `reason`、`abortedAt`、`abortedBy` |

```ts
type Crew = readonly [WorkerId, WorkerId];

type EquipmentCheck = Readonly<{
  workerId: WorkerId;
  oxygenMinutes: number;
  checkedAt: string;
}>;

type Approver = "base-commander" | "ground-control";

type ReturnRecord =
  | Readonly<{ kind: "Planned" }>
  | Readonly<{ kind: "Emergency"; reason: string }>;

type Requested = Readonly<{
  kind: "Requested";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
}>;

type Approved = Readonly<{
  kind: "Approved";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  segmentId: SegmentId;
  equipmentChecks: readonly [EquipmentCheck, EquipmentCheck];
  approvedAt: string;
  approvedBy: Approver;
}>;

type Aborted = Readonly<{
  kind: "Aborted";
  permitId: PermitId;
  zoneId: ZoneId;
  crew: Crew;
  plannedMinutes: number;
  requestedAt: string;
  reason: string;
  abortedAt: string;
  abortedBy: Approver;
}>;
```

累積線量は状態に持たない。承認の判定にだけ使う。

## 遷移

| 遷移関数 | 受け取る状態 | 返す状態 | 補足 |
| --- | --- | --- | --- |
| `approve` | `Requested` | `Approved` | 開始承認。中心の操作 |
| `egress` | `Approved` | `Outside` | エアロック出発の記録 |
| `returnToBase` | `Outside` | `Returned` | `ReturnRecord` を受け取る。緊急なら理由必須 |
| `close` | `Returned` | `Closed` | 電気主任が遮断札を外し、作業記録を確認 |
| `abort` | `Requested \| Approved` | `Aborted` | 理由必須。出発後は受け取らない |

`Closed` と `Aborted` からの遷移はない。状態を足したときの分岐漏れは
`toStatusLabel` の `assertNever` で検出する。

## 開始承認の条件

規程第2条と第10条。`approve` の型で表せる条件と、実行時に判定する条件に
分かれる。

| # | 条件 | 表し方 |
| --- | --- | --- |
| 1 | 2名分の装備点検が記録済み | `equipmentChecks` を長さ2のタプルで受け取る |
| 2 | 酸素残時間が予定作業時間 + 60分以上 | 判定。失敗は `InsufficientOxygen` |
| 3 | 累積線量 + 予測線量が上限以内 | 判定。`Sensitive<number>` を unwrap して比較。失敗は `DoseLimitExceeded` |
| 4 | フレア警報なし | 判定。失敗は `FlareAlertActive` |
| 5 | 相方が同じ許可に登録 | `crew` を長さ2のタプルで持つ |
| 6 | 系統区間に遮断札が掛かっている | `segmentId` を必須の入力にする。区画との対応は判定 |
| 7 | 月面日が第14日以前 | 判定。`Clock` の月面日を使う。失敗は `NightTime` |

S1 の設計アプローチ比較では、この7条件を一つの関数として10通りに書く。
S6 の演習で参加者が扱う失敗は `PermitNotFound`、`InvalidPermitState`、
`DoseLimitExceeded`、`FlareAlertActive` の4つに絞り、残りは配布済みにする。

## 中心のユースケース

```ts
type ApproveEvaInput = Readonly<{
  permitId: PermitId;
  segmentId: SegmentId;
  equipmentChecks: readonly [EquipmentCheck, EquipmentCheck];
  approvedBy: Approver;
}>;

type ApproveEvaError =
  | PermitNotFound
  | InvalidPermitState
  | DoseLimitExceeded
  | FlareAlertActive
  | InsufficientOxygen
  | NightTime;

approveEva(deps)(input): Result<Approved, ApproveEvaError>
approveEvaWithEffects(deps)(input): ResultAsync<Approved, ApproveEvaError | PermitConflict>
```

失敗の型はすべて `kind` を持つ。呼び出し側（基地の端末と地上管制の端末）
は `kind` で分岐し、`match` と `assertNever` で網羅する。

## イベントと記録

```ts
type EventContext = Readonly<{
  eventId: EventId;
  occurredAt: string;   // 地球時（UTC、ISO 8601）
  lunarDay: number;     // 月面日
}>;

type EvaApproved = Readonly<{
  kind: "EvaApproved";
  eventId: EventId;
  occurredAt: string;
  lunarDay: number;
  permitId: PermitId;
  aggregateState: Approved;
}>;
```

作業記録（`WorkLog`）は追記のみ。payload には `permitId`、`segmentId`、
`approvedAt`、`approvedBy` だけを入れ、累積線量と装備点検の生データは
入れない。状態の保存と作業記録の追記は同じトランザクションで行い、
どちらか一方だけが残る状態を作らない。

## 依存（port）

| port | 役割 |
| --- | --- |
| `PermitResolver.resolveById` | 作業許可の現在状態を返す |
| `CrewDoseResolver.resolve(workerId)` | 医務の累積線量を `Sensitive<number>` で返す |
| `SpaceWeather.currentAlert()` | フレア警報の有無 |
| `Clock.now()` / `Clock.lunarDay()` | 地球時と月面日 |
| `EventIdGenerator.generate()` | 記録ID |
| `EvaApprovedStore.store(event)` | 状態と作業記録を一度に保存 |

## 機微情報

累積線量は `Sensitive<number>` で包む。`toJSON`、`toString`、`inspect` は
`[REDACTED]` を返し、値を取り出すには `unwrap()` を明示的に呼ぶ。承認の
判定は unwrap した値で行い、状態、イベント、ログには載せない。

## 旧コード（S0）の形

元教材の session-00 と同じ欠陥を持たせる。

- `EvaPermit` の `status` は任意の文字列。状態固有の項目はすべて optional
- `permitId`、`zoneId`、`segmentId`、`crew` の要素はすべて `string`
- `approveEva(repository)(input)` は、許可が見つからないと例外を投げ、
  状態を確認せずに `status: "approved"` へ更新する
- 医務の累積線量を `crewDose: number[]` として許可の状態へ書き込み、その
  状態を丸ごと作業記録の payload に保存する
- `new Date()` と `randomUUID()` を処理の中で呼ぶ
- 状態の保存と作業記録の追記が別々の `repository.save` と
  `repository.appendAudit`
- 地上管制の端末からの入力は `any` で受け取り、検証しない

事故を再現するデモ操作は元教材と同じ5種類を置く。不明な状態への更新、
識別子の入れ替え、不正な入力、存在しない許可、承認の二重実行。

## フィクスチャ

`examples/fixtures/moonbase.ts`。累積線量の単位は µSv で、上限は滞在1回あたり
50,000 µSv（50 mSv）、月面の線量率は 60 µSv/h とする。予定作業180分の予測線量は
180 µSv なので、既定の2名はどちらも上限内に収まる。上限超過を試すときは
`W-04` を 49,900 µSv にする。

```ts
export const moonbaseFixture = {
  permitId: "EVA-0412",
  zoneId: "PV-07",
  segmentId: "PV-07",
  wrongSegmentId: "PV-01",
  crew: ["W-03", "W-04"],
  plannedMinutes: 180,
  oxygenMinutes: 300,
  doseLimitMicroSv: 50_000,
  crewDoseMicroSv: { "W-03": 31_500, "W-04": 44_000 },
  requestedAt: "2026-09-15T00:00:00.000Z",
  checkedAt: "2026-09-15T00:40:00.000Z",
  approvedAt: "2026-09-15T01:00:00.000Z",
  egressAt: "2026-09-15T01:30:00.000Z",
  returnedAt: "2026-09-15T04:30:00.000Z",
  lockoutRemovedAt: "2026-09-15T04:45:00.000Z",
  closedAt: "2026-09-15T05:00:00.000Z",
  abortedAt: "2026-09-15T00:50:00.000Z",
  lunarDay: 1,
  eventId: "55555555-5555-4555-8555-555555555555",
} as const;
```

## ドメインの置き場所

`src/domain/` は概念ごとのディレクトリに分け、外からは各ディレクトリの
`index.ts` だけを import する。この規約は `packages/base-web` の契約テストが
検査する。

| ディレクトリ | 中身 |
| --- | --- |
| `domain/aggregate/` | `Clock`（`now` と `lunarDay`）、`EventContext`、`EventId`、`EventIdGenerator` |
| `domain/permit/` | 6状態、遷移関数、`EvaPermit.approve`（イベントを返す）、`EvaApproved`、`PermitId`、`ZoneId`、`toStatusLabel` |
| `domain/lockout/` | `SegmentId` |
| `domain/worker/` | `WorkerId`、`EquipmentCheck`（酸素残時間を含む）、`CumulativeDose`（`Sensitive<number>`）、`CrewDoseResolver` の port |
| `domain/spaceWeather/` | `FlareAlert` |
| `shared/` | `Sensitive`、`schemaResult` |
| `boundary/` | `ApproveEvaInput`、`SpaceWeatherReport`（外部JSONの検証例） |
| `useCase/` | `approveEva`、`approveEvaWithEffects`、失敗の型と `ensure*`、port の集合 |

`CrewDoseResolver` を worker 概念に置くのは、`useCase/errors.ts` と
`useCase/dependencies.ts` が互いを import する循環を避けるため。

## セッションごとの変更対象

元教材のステップ数と変更範囲をそのまま写す。

| 回 | 元 | 変更対象 | ステップ |
| --- | --- | --- | --- |
| S3 | S2 | `src/domain/permit/transitions.ts`、`statusLabel.ts`（2ファイル） | 1 `approve` が `Requested` だけを受け取る 2 `abort` の理由を必須にする 3 `close` が `Returned` だけを受け取り、他の遷移も許可された遷移元だけにする 4 `toStatusLabel` を `assertNever` で網羅 |
| S4 | S3 | `src/domain/permit/zoneId.ts`、`segmentId.ts`、`permit.ts`、`transitions.ts`、`domain.test-types.ts`（5ファイル） | 1 `ZoneId` と `SegmentId` を配布済みの `PermitId` と同じ規約で作る 2 状態と `approve` が用途別の識別子を受け取る 3 入れ替えたコードが型エラーになることを `@ts-expect-error` で確かめる |
| S5 | S4 | `src/boundary/approveEvaInput.ts`（1ファイル） | 1 不正な許可番号を `ApproveEvaInput` にしない 2 不正な系統区間を `ApproveEvaInput` にしない。解説で `Sensitive` と宇宙天気の外部JSON検証を扱う |
| S6 | S5 | `src/useCase/errors.ts`、`approveEva.ts`、`src/web/routes.ts`（3ファイル） | 1 状態不正を型付きの失敗にする 2 許可なしを型付きの失敗にする 3 `andThen` で失敗を運び、失敗後の遷移と保存をしない 4 端末側で `kind` を網羅して通知に変換する |
| S7 | S6 | `src/useCase/dependencies.ts`、`approveEva.ts`、`src/domain/aggregate/*`（3ファイル） | 1 `Clock` と `EventIdGenerator` から `EventContext` を一度だけ作る 2 状態と作業記録を1回の保存で残す 3 非同期で保存してもイベントを結果として返す 4 保存障害を業務の失敗に偽装せず例外として伝播する |

開始スナップショットの RED は、`exercises/*.test.ts` の `expectTypeOf` と
実行時 assertion で、業務語彙のメッセージを持たせる。module-not-found や
import error を RED にしない。

## スナップショット

| ディレクトリ | 内容 |
| --- | --- |
| `examples/session-00` | 旧コード。S0 で読む |
| `examples/session-01` | S1 の10通りの `canApprove`。各実装に同じテストを当てる |
| `examples/session-02` | S2（EventStorming）が読む旧コード。session-00 と同じ操作と事故を持つ |
| `examples/session-03`〜`session-07` | S3〜S7 の開始コード。前の回の解答を取り込み済み |
| `examples/session-08` | S7 の全解答。回帰テストのみで公開セッションを持たない |
| `examples/final` | 参照実装。複数集約、認証、projection |
| `examples/fixtures` | 共通フィクスチャ |

元教材の `session-NN` は、S0 を除き本教材の `session-(NN+1)` に対応する。
