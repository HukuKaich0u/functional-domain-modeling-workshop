import { Link } from "@inertiajs/react";

import { buttonClassName, DataTable, EmptyState, InlineAlert, StatusBadge } from "@moonbase/base-web";
import { lockoutPresentation } from "../../components/permitPresentation.js";
import type { SharedPageProps } from "../../pageProps.js";
import type { SegmentPageView } from "../../routes/segmentRoutes.js";
import Layout from "../Layout.js";

type Props = SharedPageProps &
  Readonly<{ segments: readonly SegmentPageView[]; canRegister: boolean }>;

export default function SegmentsIndex({ auth, canRegister, segments }: Props) {
  return (
    <Layout
      actions={
        canRegister ? (
          <Link className={buttonClassName()} href="/segments/new">
            系統区間を登録
          </Link>
        ) : undefined
      }
      activeNavigation="segments"
      title="系統区間と遮断盤"
      user={auth.user}
    >
      <InlineAlert>
        遮断札には作業許可番号を書き、掛けた電気主任だけが外せます（規程第3条）。
      </InlineAlert>
      {segments.length === 0 ? (
        <EmptyState>系統区間は登録されていません。</EmptyState>
      ) : (
        <DataTable label="系統区間一覧">
          <thead>
            <tr>
              <th scope="col">系統区間</th>
              <th scope="col">名称</th>
              <th scope="col">遮断状態</th>
              <th scope="col">札の作業許可</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => {
              const status = lockoutPresentation(segment.lockout.kind);
              return (
                <tr key={segment.segmentId}>
                  <td><Link href={`/segments/${segment.segmentId}`}>{segment.segmentId}</Link></td>
                  <td>{segment.label}</td>
                  <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                  <td>{segment.lockout.kind === "LockedOut" ? segment.lockout.permitId : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </Layout>
  );
}
