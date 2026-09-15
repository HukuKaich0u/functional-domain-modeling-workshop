import { Link, useForm } from "@inertiajs/react";

import { buttonClassName, DataTable, EmptyState, ErrorSummary, InlineAlert } from "@moonbase/base-web";
import type { SharedPageProps } from "../../pageProps.js";
import type { WorkerPageView } from "../../routes/workerRoutes.js";
import Layout from "../Layout.js";

type Props = SharedPageProps & Readonly<{ workers: readonly WorkerPageView[] }>;

export default function WorkersIndex({ auth, errors, workers }: Props) {
  const deletion = useForm({});
  const remove = (worker: WorkerPageView) => {
    if (window.confirm(`${worker.workerId} を削除しますか？作業記録は保持されます。`)) {
      deletion.post(`/workers/${worker.workerId}/delete`, { forceFormData: true });
    }
  };

  return (
    <Layout
      actions={
        <Link className={buttonClassName()} href="/workers/new">
          隊員を登録
        </Link>
      }
      activeNavigation="workers"
      title="隊員と累積線量"
      user={auth.user}
    >
      <ErrorSummary errors={errors} />
      <InlineAlert>
        累積線量は医務の値です。この画面と承認の判定にだけ使い、作業許可の画面と作業記録には出しません（規程第8条）。
      </InlineAlert>
      {workers.length === 0 ? (
        <EmptyState>隊員は登録されていません。</EmptyState>
      ) : (
        <DataTable label="隊員一覧">
          <thead>
            <tr>
              <th scope="col">隊員番号</th>
              <th scope="col">資格</th>
              <th scope="col">累積線量（µSv）</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr key={worker.workerId}>
                <td><Link href={`/workers/${worker.workerId}`}>{worker.workerId}</Link></td>
                <td>{worker.qualification}</td>
                <td>{worker.cumulativeDoseMicroSv.toLocaleString("ja-JP")}</td>
                <td>
                  <div className="table-actions">
                    <Link className={buttonClassName("secondary")} href={`/workers/${worker.workerId}`}>編集</Link>
                    <button
                      className={buttonClassName("danger")}
                      disabled={deletion.processing}
                      onClick={() => remove(worker)}
                      type="button"
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Layout>
  );
}
