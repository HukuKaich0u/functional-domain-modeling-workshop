import { Link } from "@inertiajs/react";

import { Card, DataTable, EmptyState, InlineAlert, StatusBadge } from "@moonbase/base-web";
import type { FlareAlert } from "../../../../domain/spaceWeather/index.js";
import type { DashboardCounts } from "../../../../useCase/getDashboardUseCase.js";
import type { PermitView } from "../../../../useCase/permitView.js";
import type { SegmentView } from "../../../../useCase/segmentView.js";
import { lockoutPresentation, permitPresentation } from "../components/permitPresentation.js";
import type { SharedPageProps } from "../pageProps.js";
import Layout from "./Layout.js";

type DashboardProps = SharedPageProps &
  Readonly<{
    counts: DashboardCounts;
    activePermits: readonly PermitView[];
    lockedOutSegments: readonly SegmentView[];
    flareAlert: FlareAlert | null;
  }>;

const FlareAlertNotice = ({ flareAlert }: Readonly<{ flareAlert: FlareAlert | null }>) => {
  if (flareAlert === null) {
    return <InlineAlert>宇宙天気の報告がまだありません。開始承認は報告が届くまで止まります。</InlineAlert>;
  }
  return flareAlert.kind === "Clear" ? (
    <InlineAlert>フレア警報なし。船外作業の承認条件（規程第5条）を満たしています。</InlineAlert>
  ) : (
    <InlineAlert>
      {`フレア警報 ${flareAlert.level} 発令中（${flareAlert.issuedAt}）。承認は止まります。`}
    </InlineAlert>
  );
};

export default function Dashboard({
  activePermits,
  auth,
  counts,
  flareAlert,
  lockedOutSegments,
}: DashboardProps) {
  return (
    <Layout
      activeNavigation="dashboard"
      description="日の出基地の作業状況を確認します。"
      title="作業状況ボード"
      user={auth.user}
    >
      <FlareAlertNotice flareAlert={flareAlert} />
      <dl className="metrics-grid">
        <Card><dt>系統区間</dt><dd>{counts.segments}</dd></Card>
        <Card><dt>遮断中</dt><dd>{counts.lockedOutSegments}</dd></Card>
        <Card><dt>隊員</dt><dd>{counts.workers}</dd></Card>
        <Card><dt>作業許可</dt><dd>{counts.permits}</dd></Card>
        <Card><dt>進行中</dt><dd>{counts.activePermits}</dd></Card>
      </dl>
      <Card className="dashboard-queue">
        <section aria-label="進行中の作業許可">
          <h2>進行中の作業許可</h2>
          {activePermits.length === 0 ? (
            <EmptyState>進行中の作業許可はありません。</EmptyState>
          ) : (
            <DataTable label="進行中の作業許可">
              <thead>
                <tr>
                  <th scope="col">作業許可</th>
                  <th scope="col">作業区画</th>
                  <th scope="col">隊員</th>
                  <th scope="col">状態</th>
                </tr>
              </thead>
              <tbody>
                {activePermits.map((permit) => {
                  const status = permitPresentation(permit.kind);
                  return (
                    <tr key={permit.permitId}>
                      <td><Link href={`/permits/${permit.permitId}`}>{permit.permitId}</Link></td>
                      <td>{permit.zoneId}</td>
                      <td>{permit.crew.join(" / ")}</td>
                      <td>
                        <StatusBadge tone={status.tone}>
                          {status.label} ({status.canonical})
                        </StatusBadge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </section>
      </Card>
      <Card className="dashboard-queue">
        <section aria-label="遮断中の系統区間">
          <h2>遮断中の系統区間</h2>
          {lockedOutSegments.length === 0 ? (
            <EmptyState>遮断中の系統区間はありません。</EmptyState>
          ) : (
            <DataTable label="遮断中の系統区間">
              <thead>
                <tr>
                  <th scope="col">系統区間</th>
                  <th scope="col">札の作業許可</th>
                  <th scope="col">状態</th>
                </tr>
              </thead>
              <tbody>
                {lockedOutSegments.map((segment) => {
                  const status = lockoutPresentation(segment.lockout.kind);
                  return (
                    <tr key={segment.segmentId}>
                      <td><Link href={`/segments/${segment.segmentId}`}>{segment.segmentId}</Link></td>
                      <td>{segment.lockout.kind === "LockedOut" ? segment.lockout.permitId : "-"}</td>
                      <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </section>
      </Card>
    </Layout>
  );
}
