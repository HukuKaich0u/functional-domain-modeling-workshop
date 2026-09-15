---
created: 2026-08-15
updated: 2026-09-15
author: Koki Aoyagi
type: rehearsal-report
---

# MoonBaseカリキュラム 自動リハーサル記録

計画日: 2026-08-15

カリキュラム同期日: 2026-09-15

タイムゾーン: Asia/Tokyo

この文書は、自動化できるリリース検証と、現地・人間によるリハーサルが
必要な項目を分けて記録する。自動検証の成功を、人間が参加する進行
リハーサルの成功とは扱わない。

## 現行の運営契約

- 題材は MoonBase 日の出基地の船外作業許可 `EVA-0412` である。
- この開催例では S1 を省き、S0 10分 + S2 15分 + S3〜S7 各30分 +
  Final 5分 = 180分とする。S1も扱う場合は20分追加する。
- 16:25-16:55の固定休憩30分を加え、開催時間は15:00-18:30の210分である。
- S0は基地の規程、端末、保存・ログと事故報告 第1号を対応付ける。
- S2はExcalidrawを使い、「船外作業が中止された」からアクター、コマンド、
  業務条件を逆算する。実行可能な演習ではない。
- S3〜S7は同じ開始承認を題材に、状態、識別子、入力境界、業務上の失敗、
  出力イベントと副作用を順に実装する。

## 5演習の意図したRED

S0、S1、S2、到達点 `examples/session-08`、Finalにはexercise scriptを設けない。

| コマンド | 参加者ステップ | 意図した開始時のRED |
| --- | ---: | --- |
| `pnpm exercise:03` | 4 | 作業許可の状態遷移と網羅性の `AssertionError` |
| `pnpm exercise:04` | 3 | `ZoneId` と `SegmentId` の取り違えと型テスト不足の `AssertionError` |
| `pnpm exercise:05` | 2 | 不正な許可IDと系統区間IDを拒否する `AssertionError` |
| `pnpm exercise:06` | 3 | 許可なし、状態不正、同期Result pipelineの `AssertionError` |
| `pnpm exercise:07` | 4 | 決定性、single store、ResultAsync、保存失敗の `AssertionError` |

module resolution、syntax、type setupの失敗や予期しない例外は、意図した
REDではない。検査結果のschemaと被ばく量のマスキングはS5の時間外補足で、
`exercise:05` の失敗件数へ含めない。

## 次snapshotのGREEN連鎖と解答表示

- S3の解答は `examples/session-04`、S4は `examples/session-05`、S5は
  `examples/session-06`、S6は `examples/session-07` の同一相対pathを参照する。
- S7は `examples/session-08` の全target完成ファイルを反映した後に、型検査・
  通常回帰・exerciseをまとめてGREENにする。1stepずつの個別GREENは約束しない。
- `examples/session-08` はS3〜S7の演習範囲を統合した到達点である。
- `examples/final` は7条件、役割、状態、監査記録を統合した参照実装であり、
  参加者はセットアップや編集を行わない。

## 公開routeと変更境界

公開セッションは `/sessions/00-system-handover/`、
`/sessions/01-design-approaches/`、
`/sessions/02-business-events-and-workflows/`、
`/sessions/03-state-transitions/`、`/sessions/04-semantic-identifiers/`、
`/sessions/05-boundaries-and-sensitive-data/`、
`/sessions/06-workflow-errors/`、`/sessions/07-effects-and-consistency/`、
`/sessions/final/` である。旧URLはWorkerの互換redirectとそのtest以外から
案内しない。

## 未確認（現地・人間のリハーサルが必要）

- S2の15分で、班が一つの成功イベントからアクター、コマンド、業務条件を
  4分で逆算できるか。
- Event、Actor、Command、Hotspotを扱い、講師が後から`EvaPermit`集約を
  加える進行で混乱しないか。
- ExcalidrawのLive collaborationをS2開始前に班ごとに立ち上げられるか。
- 共同編集が使えない場合、紙の付箋へ30秒で切り替えられるか。
- エージェントを使わない参加者が、S7の全target完成ファイルを委譲時間内に
  反映できるか。
- 5人班で7分版と8分版の相互レビューが回るか。
- 班数分の外部display、HDMI、USB-C adapter、電源があるか。

上の実測が終わるまでは、班ワーク、相互レビュー、手動fallbackを成功済みと
記録しない。
