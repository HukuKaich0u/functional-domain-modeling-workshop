import { useForm } from "@inertiajs/react";

import {
  buttonClassName,
  Card,
  ErrorSummary,
  FieldError,
  InlineAlert,
  StatusBadge,
} from "@moonbase/base-web";
import { lockoutPresentation, permitPresentation } from "../../components/permitPresentation.js";
import type { SharedPageProps } from "../../pageProps.js";
import type {
  EquipmentCheckPageView,
  PermitActions,
  PermitPageView,
} from "../../routes/permitRoutes.js";
import type { SegmentPageView } from "../../routes/segmentRoutes.js";
import Layout from "../Layout.js";

type Props = SharedPageProps &
  Readonly<{
    permit: PermitPageView;
    equipmentChecks: readonly EquipmentCheckPageView[];
    segment: SegmentPageView | null;
    actions: PermitActions;
  }>;

const submit = (form: ReturnType<typeof useForm>, path: string) =>
  (event: React.FormEvent) => {
    event.preventDefault();
    form.post(path, { forceFormData: true, preserveScroll: true });
  };

const returnKindLabel = (kind: "Planned" | "Emergency"): string =>
  kind === "Planned" ? "予定どおり" : "緊急帰還";

const stateDetails = (permit: PermitPageView): React.ReactNode => {
  switch (permit.kind) {
    case "Requested":
      return null;
    case "Approved":
      return <>
        <dt>系統区間</dt><dd>{permit.segmentId}</dd>
        <dt>承認者</dt><dd>{permit.approvedBy}</dd>
        <dt>承認日時</dt><dd>{`${permit.approvedAt}（月面日 第${permit.approvalLunarDay}日）`}</dd>
      </>;
    case "Outside":
      return <>
        <dt>系統区間</dt><dd>{permit.segmentId}</dd>
        <dt>承認日時</dt><dd>{`${permit.approvedAt}（月面日 第${permit.approvalLunarDay}日）`}</dd>
        <dt>出発日時</dt><dd>{permit.egressAt}</dd>
      </>;
    case "Returned":
      return <>
        <dt>系統区間</dt><dd>{permit.segmentId}</dd>
        <dt>承認日時</dt><dd>{`${permit.approvedAt}（月面日 第${permit.approvalLunarDay}日）`}</dd>
        <dt>出発日時</dt><dd>{permit.egressAt}</dd>
        <dt>帰還日時</dt><dd>{`${permit.returnedAt}（${returnKindLabel(permit.returnKind)}）`}</dd>
        <dt>進行状況</dt><dd>遮断札の取り外しと完了を待っています</dd>
      </>;
    case "Closed":
      return <>
        <dt>系統区間</dt><dd>{permit.segmentId}</dd>
        <dt>承認日時</dt><dd>{`${permit.approvedAt}（月面日 第${permit.approvalLunarDay}日）`}</dd>
        <dt>出発日時</dt><dd>{permit.egressAt}</dd>
        <dt>帰還日時</dt><dd>{`${permit.returnedAt}（${returnKindLabel(permit.returnKind)}）`}</dd>
        <dt>札の取り外し</dt><dd>{permit.lockoutRemovedAt}</dd>
        <dt>完了日時</dt><dd>{permit.closedAt}</dd>
      </>;
    case "Aborted":
      return <>
        <dt>中止した者</dt><dd>{permit.abortedBy}</dd>
        <dt>中止日時</dt><dd>{permit.abortedAt}</dd>
      </>;
    default:
      return permit satisfies never;
  }
};

export default function PermitShow({
  actions,
  auth,
  equipmentChecks,
  errors,
  permit,
  segment,
}: Props) {
  const base = `/permits/${permit.permitId}`;
  const presentation = permitPresentation(permit.kind);
  const approve = useForm({});
  const egress = useForm({});
  const close = useForm({});
  const equipmentCheck = useForm<{
    workerId: string;
    oxygenMinutes: string;
    note: string;
    needsMaintenance: boolean;
  }>({ workerId: permit.crew[0], oxygenMinutes: "", note: "", needsMaintenance: false });
  const returnForm = useForm<{ returnKind: "Planned" | "Emergency"; reason: string }>({
    returnKind: "Planned",
    reason: "",
  });
  const abort = useForm({ reason: "" });
  const submitAbort = (event: React.FormEvent) => {
    event.preventDefault();
    if (window.confirm("この作業許可を中止しますか？")) {
      abort.post(`${base}/abort`, { forceFormData: true, preserveScroll: true });
    }
  };
  const hasAvailableAction =
    actions.recordEquipmentCheck ||
    actions.approve ||
    actions.egress ||
    actions.returnToBase ||
    actions.close ||
    actions.abort;
  const checkedWorkers = new Set(equipmentChecks.map((check) => check.workerId));

  return (
    <Layout activeNavigation="permits" title="作業許可の詳細" user={auth.user}>
      <ErrorSummary errors={errors} />
      <div className="appointment-workspace">
        <section aria-label="作業許可情報" className="appointment-summary">
          <Card>
            <div className="appointment-summary__status">
              <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>
              <span className="status-canonical">{presentation.canonical}</span>
            </div>
            <dl>
              <dt>作業許可</dt><dd>{permit.permitId}</dd>
              <dt>作業区画</dt><dd>{permit.zoneId}</dd>
              <dt>隊員</dt><dd>{permit.crew.join(" / ")}</dd>
              <dt>予定作業時間</dt><dd>{permit.plannedMinutes} 分</dd>
              <dt>申請日時</dt><dd>{permit.requestedAt}</dd>
              {stateDetails(permit)}
            </dl>
          </Card>
          <Card>
            <h2>承認条件の準備状況</h2>
            <dl>
              <dt>装備点検（規程第2条）</dt>
              <dd>
                {permit.crew.map((workerId) => (
                  <span key={workerId}>
                    {`${workerId}: ${checkedWorkers.has(workerId) ? "記録済み" : "未記録"} `}
                  </span>
                ))}
              </dd>
              <dt>遮断札（規程第3条）</dt>
              <dd>
                {segment === null ? (
                  "系統区間が未登録"
                ) : (
                  `${segment.segmentId}: ${lockoutPresentation(segment.lockout.kind).label}${
                    segment.lockout.kind === "LockedOut" ? `（札: ${segment.lockout.permitId}）` : ""
                  }`
                )}
              </dd>
            </dl>
            {equipmentChecks.length === 0 ? null : (
              <ul aria-label="装備点検の記録">
                {equipmentChecks.map((check) => (
                  <li key={check.checkId}>
                    {`${check.workerId}: 酸素 ${check.oxygenMinutes} 分${check.needsMaintenance ? "（整備要）" : ""} — ${check.checkedAt}`}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <aside aria-label="現在の操作" className="workflow-panel">
          <Card>
            {hasAvailableAction ? null : (
              <InlineAlert>現在実行できる操作はありません</InlineAlert>
            )}

            {actions.recordEquipmentCheck ? (
              <form
                aria-label="装備点検を記録"
                className="workflow-primary"
                onSubmit={submit(equipmentCheck, `${base}/equipment-checks`)}
              >
                <label htmlFor="workerId">
                  隊員
                  <select
                    id="workerId"
                    name="workerId"
                    onChange={(event) => equipmentCheck.setData("workerId", event.target.value)}
                    value={equipmentCheck.data.workerId}
                  >
                    {permit.crew.map((workerId) => (
                      <option key={workerId} value={workerId}>{workerId}</option>
                    ))}
                  </select>
                </label>
                <FieldError field="workerId" message={errors.workerId} />
                <label htmlFor="oxygenMinutes">
                  酸素残時間（分）
                  <input
                    id="oxygenMinutes"
                    min={0}
                    name="oxygenMinutes"
                    onChange={(event) => equipmentCheck.setData("oxygenMinutes", event.target.value)}
                    type="number"
                    value={equipmentCheck.data.oxygenMinutes}
                  />
                </label>
                <FieldError field="oxygenMinutes" message={errors.oxygenMinutes} />
                <label htmlFor="note">
                  点検所見
                  <textarea
                    id="note"
                    name="note"
                    onChange={(event) => equipmentCheck.setData("note", event.target.value)}
                    value={equipmentCheck.data.note}
                  />
                </label>
                <FieldError field="note" message={errors.note} />
                <label>
                  <input
                    checked={equipmentCheck.data.needsMaintenance}
                    name="needsMaintenance"
                    onChange={(event) => equipmentCheck.setData("needsMaintenance", event.target.checked)}
                    type="checkbox"
                  />
                  整備が必要
                </label>
                <button
                  aria-busy={equipmentCheck.processing || undefined}
                  className={buttonClassName("secondary")}
                  disabled={equipmentCheck.processing}
                  type="submit"
                >
                  {equipmentCheck.processing ? "記録中…" : "装備点検を記録"}
                </button>
              </form>
            ) : null}

            {actions.approve ? (
              <form className="workflow-primary" onSubmit={submit(approve, `${base}/approve`)}>
                <button
                  aria-busy={approve.processing || undefined}
                  className={buttonClassName()}
                  disabled={approve.processing}
                  type="submit"
                >
                  {approve.processing ? "確認中…" : "開始を承認する"}
                </button>
              </form>
            ) : null}

            {actions.egress ? (
              <form className="workflow-primary" onSubmit={submit(egress, `${base}/egress`)}>
                <button
                  aria-busy={egress.processing || undefined}
                  className={buttonClassName()}
                  disabled={egress.processing}
                  type="submit"
                >
                  {egress.processing ? "記録中…" : "出発を記録する"}
                </button>
              </form>
            ) : null}

            {actions.returnToBase ? (
              <form className="workflow-primary" onSubmit={submit(returnForm, `${base}/return`)}>
                <label htmlFor="returnKind">
                  帰還の種類
                  <select
                    id="returnKind"
                    name="returnKind"
                    onChange={(event) =>
                      returnForm.setData(
                        "returnKind",
                        event.target.value === "Emergency" ? "Emergency" : "Planned",
                      )
                    }
                    value={returnForm.data.returnKind}
                  >
                    <option value="Planned">予定どおり</option>
                    <option value="Emergency">緊急帰還</option>
                  </select>
                </label>
                {returnForm.data.returnKind === "Emergency" ? (
                  <>
                    <label htmlFor="reason">
                      緊急帰還の理由
                      <textarea
                        id="reason"
                        name="reason"
                        onChange={(event) => returnForm.setData("reason", event.target.value)}
                        value={returnForm.data.reason}
                      />
                    </label>
                    <FieldError field="reason" message={errors.reason} />
                  </>
                ) : null}
                <button
                  aria-busy={returnForm.processing || undefined}
                  className={buttonClassName()}
                  disabled={returnForm.processing}
                  type="submit"
                >
                  {returnForm.processing ? "記録中…" : "帰還を記録する"}
                </button>
              </form>
            ) : null}

            {actions.close ? (
              <form className="workflow-primary" onSubmit={submit(close, `${base}/close`)}>
                <p>遮断札を外し、作業記録を確認して完了にします。札は掛けた者だけが外せます。</p>
                <button
                  aria-busy={close.processing || undefined}
                  className={buttonClassName()}
                  disabled={close.processing}
                  type="submit"
                >
                  {close.processing ? "処理中…" : "札を外して完了にする"}
                </button>
              </form>
            ) : null}

            {actions.abort ? (
              <form className="danger-zone" onSubmit={submitAbort}>
                <label htmlFor="abortReason">
                  中止理由
                  <textarea
                    aria-describedby={errors.reason === undefined ? undefined : "reason-error"}
                    aria-invalid={errors.reason === undefined ? undefined : true}
                    id="abortReason"
                    name="reason"
                    onChange={(event) => abort.setData("reason", event.target.value)}
                    value={abort.data.reason}
                  />
                </label>
                <FieldError field="reason" message={errors.reason} />
                <button
                  aria-busy={abort.processing || undefined}
                  className={buttonClassName("danger")}
                  disabled={abort.processing}
                  type="submit"
                >
                  {abort.processing ? "処理中…" : "作業許可を中止"}
                </button>
              </form>
            ) : null}
          </Card>
        </aside>
      </div>
    </Layout>
  );
}
