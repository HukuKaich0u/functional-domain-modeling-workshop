import { Link } from "@inertiajs/react";

import { buttonClassName, DataTable, EmptyState, StatusBadge } from "@moonbase/base-web";
import { permitPresentation } from "../../components/permitPresentation.js";
import type { SharedPageProps } from "../../pageProps.js";
import type { PermitPageView } from "../../routes/permitRoutes.js";
import Layout from "../Layout.js";

type Props = SharedPageProps &
  Readonly<{ permits: readonly PermitPageView[]; canRequest: boolean }>;

export default function PermitsIndex({ auth, canRequest, permits }: Props) {
  return (
    <Layout
      actions={
        canRequest ? (
          <Link className={buttonClassName()} href="/permits/new">
            作業許可を申請
          </Link>
        ) : undefined
      }
      activeNavigation="permits"
      title="作業許可一覧"
      user={auth.user}
    >
      {permits.length === 0 ? (
        <EmptyState>作業許可はありません。</EmptyState>
      ) : (
        <DataTable label="作業許可一覧">
          <thead>
            <tr>
              <th scope="col">作業許可</th>
              <th scope="col">状態</th>
              <th scope="col">作業区画</th>
              <th scope="col">隊員</th>
              <th scope="col">予定時間</th>
              <th scope="col">申請日時</th>
            </tr>
          </thead>
          <tbody>
            {permits.map((permit) => {
              const status = permitPresentation(permit.kind);
              return (
                <tr key={permit.permitId}>
                  <td>
                    <Link href={`/permits/${permit.permitId}`}>{permit.permitId}</Link>
                  </td>
                  <td>
                    <StatusBadge tone={status.tone}>
                      {status.label} ({status.canonical})
                    </StatusBadge>
                  </td>
                  <td>{permit.zoneId}</td>
                  <td>{permit.crew.join(" / ")}</td>
                  <td>{permit.plannedMinutes} 分</td>
                  <td>{permit.requestedAt}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </Layout>
  );
}
