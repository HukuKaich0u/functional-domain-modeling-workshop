import { Link, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";

import { buttonClassName, Card, ErrorSummary, FieldError, FormField, StatusBadge } from "@moonbase/base-web";
import { lockoutPresentation } from "../../components/permitPresentation.js";
import type { SharedPageProps } from "../../pageProps.js";
import type { SegmentActions, SegmentPageView } from "../../routes/segmentRoutes.js";
import Layout from "../Layout.js";

type SegmentFormProps = SharedPageProps &
  Readonly<{
    mode: "create" | "edit";
    segment: SegmentPageView | null;
    actions: SegmentActions | null;
  }>;

export default function SegmentForm({ actions, auth, errors, mode, segment }: SegmentFormProps) {
  const form = useForm({
    segmentId: segment?.segmentId ?? "",
    label: segment?.label ?? "",
  });
  const lockout = useForm({ permitId: "" });
  const release = useForm({});
  const deletion = useForm({});
  const base = segment === null ? "/segments" : `/segments/${segment.segmentId}`;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "create") {
      form.post("/segments", { forceFormData: true });
      return;
    }
    if (segment !== null) {
      form.post(base, { forceFormData: true });
    }
  };
  const submitLockout = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    lockout.post(`${base}/lockout`, { forceFormData: true, preserveScroll: true });
  };
  const submitRelease = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (window.confirm("遮断札を外して通電に戻しますか？")) {
      release.post(`${base}/release`, { forceFormData: true, preserveScroll: true });
    }
  };
  const remove = () => {
    if (segment !== null && window.confirm(`${segment.segmentId} を削除しますか？作業記録は保持されます。`)) {
      deletion.post(`${base}/delete`, { forceFormData: true });
    }
  };
  const canEdit = mode === "create" || actions?.edit === true;

  return (
    <Layout
      activeNavigation="segments"
      title={mode === "create" ? "系統区間を登録" : "系統区間の詳細"}
      user={auth.user}
    >
      <ErrorSummary errors={errors} />
      <div className="settings-grid">
        <section aria-label="系統区間">
          <Card className="management-form-card">
            {segment === null ? null : (
              <div className="appointment-summary__status">
                <StatusBadge tone={lockoutPresentation(segment.lockout.kind).tone}>
                  {lockoutPresentation(segment.lockout.kind).label}
                </StatusBadge>
                <span className="status-canonical">{segment.lockout.kind}</span>
              </div>
            )}
            {segment !== null && segment.lockout.kind === "LockedOut" ? (
              <dl className="metadata-list">
                <div><dt>札の作業許可</dt><dd>{segment.lockout.permitId}</dd></div>
                <div><dt>掛けた者</dt><dd>{segment.lockout.taggedBy}</dd></div>
                <div><dt>掛けた日時</dt><dd>{segment.lockout.taggedAt}</dd></div>
              </dl>
            ) : null}
            <form
              aria-label={mode === "create" ? "系統区間登録" : "系統区間編集"}
              className="form-stack"
              onSubmit={submit}
            >
              <FormField
                {...(errors.segmentId === undefined ? {} : { error: errors.segmentId })}
                description="PV-07 の形。作業区画と同じ書式ですが、型で区別します"
                field="segmentId"
                label="系統区間"
              >
                <input
                  aria-describedby={errors.segmentId === undefined ? undefined : "segmentId-error"}
                  aria-invalid={errors.segmentId === undefined ? undefined : true}
                  id="segmentId"
                  name="segmentId"
                  onChange={(event) => form.setData("segmentId", event.target.value)}
                  placeholder="PV-07"
                  readOnly={mode === "edit"}
                  required
                  type="text"
                  value={form.data.segmentId}
                />
              </FormField>
              <FormField
                {...(errors.label === undefined ? {} : { error: errors.label })}
                field="label"
                label="名称"
              >
                <input
                  aria-describedby={errors.label === undefined ? undefined : "label-error"}
                  aria-invalid={errors.label === undefined ? undefined : true}
                  id="label"
                  name="label"
                  onChange={(event) => form.setData("label", event.target.value)}
                  readOnly={!canEdit}
                  required
                  type="text"
                  value={form.data.label}
                />
              </FormField>
              <div className="form-actions">
                <Link className={buttonClassName("secondary")} href="/segments">
                  一覧へ戻る
                </Link>
                {canEdit ? (
                  <button
                    aria-busy={form.processing || undefined}
                    className={buttonClassName()}
                    disabled={form.processing}
                    type="submit"
                  >
                    {mode === "create" ? "登録" : "更新"}
                  </button>
                ) : null}
                {actions?.delete === true ? (
                  <button
                    className={buttonClassName("danger")}
                    disabled={deletion.processing}
                    onClick={remove}
                    type="button"
                  >
                    削除
                  </button>
                ) : null}
              </div>
            </form>
          </Card>
        </section>
        {mode === "edit" && actions !== null && (actions.lockout || actions.release) ? (
          <section aria-label="遮断札">
            <Card className="management-form-card">
              <h2>遮断札</h2>
              {actions.lockout ? (
                <form aria-label="遮断札を掛ける" className="form-stack" onSubmit={submitLockout}>
                  <FormField
                    {...(errors.permitId === undefined ? {} : { error: errors.permitId })}
                    description="申請済の作業許可番号。作業区画と一致する必要があります"
                    field="permitId"
                    label="札に書く作業許可番号"
                  >
                    <input
                      aria-describedby={errors.permitId === undefined ? undefined : "permitId-error"}
                      aria-invalid={errors.permitId === undefined ? undefined : true}
                      id="permitId"
                      name="permitId"
                      onChange={(event) => lockout.setData("permitId", event.target.value)}
                      placeholder="EVA-0412"
                      required
                      type="text"
                      value={lockout.data.permitId}
                    />
                  </FormField>
                  <div className="form-actions">
                    <button
                      aria-busy={lockout.processing || undefined}
                      className={buttonClassName()}
                      disabled={lockout.processing}
                      type="submit"
                    >
                      {lockout.processing ? "処理中…" : "遮断して札を掛ける"}
                    </button>
                  </div>
                </form>
              ) : null}
              {actions.release ? (
                <form aria-label="遮断札を外す" className="form-stack" onSubmit={submitRelease}>
                  <p>承認済の札を外すには、先に作業許可を理由付きで中止してください。帰還後は作業許可の完了で外します。</p>
                  <FieldError field="form" message={undefined} />
                  <div className="form-actions">
                    <button
                      aria-busy={release.processing || undefined}
                      className={buttonClassName("danger")}
                      disabled={release.processing}
                      type="submit"
                    >
                      {release.processing ? "処理中…" : "札を外して通電に戻す"}
                    </button>
                  </div>
                </form>
              ) : null}
            </Card>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}
