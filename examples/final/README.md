# Final: MoonBase 日の出基地の作業管理アプリ

`examples/final` は、作業許可を不正な状態へ戻す、作業区画と系統区間を取り違える、状態だけ更新されて作業記録が残らない、被ばく量が表示やログへ混じるといった業務事故を防ぐ完成アプリです。Hono、Inertia、React、Drizzle、file SQLite を一つの package で動かします。

S3〜S7 の開始コードにある意図的な未実装を直す演習とは別の参照実装です。演習解答は `examples/session-08` までに揃っており、Final では同じ入力・失敗・イベント・保存・例外の境界を、複数の集約に広げた形で読みます。

## セットアップと実行

Node.js 20 以上と pnpm 9.12.0 を使います。リポジトリルートで依存関係を入れ、アプリを起動します。

```bash
pnpm install --frozen-lockfile
pnpm --filter @moonbase/final dev
```

起動時に Drizzle migration が適用され、既定で `examples/final/moonbase.sqlite` を使います。既存の migration だけを適用する場合は、リポジトリルートで次を実行します。

```bash
pnpm --filter @moonbase/final db:migrate
```

schema を変更した場合は SQL を生成し、内容を確認してから migration を適用します。

```bash
pnpm --filter @moonbase/final db:generate
pnpm --filter @moonbase/final db:migrate
```

初回アクセスは `/setup` へ進み、最初の `Admin`（システム担当）を登録します。以後は `/login` からログインします。初期登録は installation marker、Admin、session、対応する2件の作業記録を1つの transaction で確定します。

production build は、常に port 3000 で Node server を起動する `dist/index.js`、`dist/static/client.js`、`dist/static/styles.css` を作ります。

```bash
pnpm --filter @moonbase/final build
pnpm --filter @moonbase/final exec node dist/index.js
```

## ロールと業務フロー

- `Admin`: システム担当。初期設定、ユーザー管理、作業記録の閲覧を担当します。事故復旧時は業務操作を代行できますが、遮断札は掛けた本人以外には外せません。
- `GroundControl`: 地上管制。系統区間と隊員の登録、作業許可の申請と中止、宇宙天気の報告を担当します。指定された医務窓口として被ばく量も登録します。基地長が船外にいる間だけ開始承認を代行します。
- `BaseCommander`: 基地長。装備点検の記録、開始承認、エアロックの出発と帰還の記録を担当します。
- `Electrician`: 電気主任。系統区間の遮断札を掛け、帰還後に札を外して作業許可を完了にします。

作業許可は `Requested → Approved → Outside → Returned → Closed` と進みます。開始承認は、装備点検2名分、酸素残時間、被ばく量、フレア警報、相方、遮断札、月面日の7条件を確認し、失敗理由を `kind` を持つ値で返します。完了は、遮断札の取り外しと作業許可の完了を1つの transaction で保存します。中止は出発前だけ可能で、理由を必須にします。

装備点検を記録し直した場合は、隊員ごとに点検時刻が最新の記録を表示と承認に使います。同じ時刻なら後から保存した記録を採用し、過去の点検と作業記録は残します。

承認から帰還までは遮断札を維持します。承認後、出発前に札を外す必要があれば、先に理由付きで許可を中止します。帰還後は完了の手続きで外します。承認と札の取り外しが競合しても、保存時の transaction で互いの現在状態を確認し、通電したまま承認が確定することを防ぎます。

教材では作業区画と給電する系統区間を同じ番号で対応させます。この簡略化は `segmentIdForZone` にまとめ、`ZoneId` と `SegmentId` の用途の違いを保ちます。

## コードの責務

- `src/domain`: 判別共用体の状態、branded ID、`Sensitive`（被ばく量）、純粋な遷移、typed domain event
- `src/useCase`: one-method resolver/read port と event store を `ResultAsync` で合成する業務処理
- `src/adaptor/primary`: Hono route、認証 cookie、Inertia props、React page
- `src/adaptor/secondary`: Drizzle/SQLite resolver、query reader、event store、パスワードハッシュ

`src/domain/permit`、`segment`、`worker`、`equipmentCheck`、`spaceWeather` の各概念は `index.ts` だけを公開 API とし、概念の外からは `index.js` を通して import します。
