import { Link, useForm } from "@inertiajs/react";

import { buttonClassName, Card, ErrorSummary, FormField } from "@moonbase/base-web";
import type { SharedPageProps } from "../../pageProps.js";
import type { PermitWorkerOption, PermitZoneOption } from "../../routes/permitRoutes.js";
import Layout from "../Layout.js";

type Props = SharedPageProps &
  Readonly<{
    zones: readonly PermitZoneOption[];
    workers: readonly PermitWorkerOption[];
  }>;

const WorkerSelect = ({
  error,
  field,
  label,
  onChange,
  value,
  workers,
}: Readonly<{
  error: string | undefined;
  field: "crewA" | "crewB";
  label: string;
  onChange: (value: string) => void;
  value: string;
  workers: readonly PermitWorkerOption[];
}>) => (
  <FormField {...(error === undefined ? {} : { error })} field={field} label={label}>
    <select
      aria-describedby={error === undefined ? undefined : `${field}-error`}
      aria-invalid={error === undefined ? undefined : true}
      id={field}
      name={field}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">選択してください</option>
      {workers.map((worker) => (
        <option key={worker.workerId} value={worker.workerId}>
          {worker.workerId}（{worker.qualification}）
        </option>
      ))}
    </select>
  </FormField>
);

export default function PermitNew({ auth, errors, workers, zones }: Props) {
  const form = useForm({
    permitId: "",
    zoneId: "",
    crewA: "",
    crewB: "",
    plannedMinutes: "",
    purpose: "",
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    form.post("/permits", { forceFormData: true });
  };

  return (
    <Layout activeNavigation="permits" title="作業許可の申請" user={auth.user}>
      <ErrorSummary errors={errors} />
      <Card className="appointment-booking-card">
        <form aria-label="作業許可申請" className="form-stack" onSubmit={submit}>
          <div className="form-grid">
            <FormField
              {...(errors.permitId === undefined ? {} : { error: errors.permitId })}
              description="EVA-0412 の形。地上管制が採番します"
              field="permitId"
              label="作業許可番号"
            >
              <input
                aria-describedby={errors.permitId === undefined ? undefined : "permitId-error"}
                aria-invalid={errors.permitId === undefined ? undefined : true}
                id="permitId"
                name="permitId"
                onChange={(event) => form.setData("permitId", event.target.value)}
                placeholder="EVA-0412"
                value={form.data.permitId}
              />
            </FormField>
            <FormField
              {...(errors.zoneId === undefined ? {} : { error: errors.zoneId })}
              description="区画へ給電する系統区間が登録済みのものだけを選べます"
              field="zoneId"
              label="作業区画"
            >
              <select
                aria-describedby={errors.zoneId === undefined ? undefined : "zoneId-error"}
                aria-invalid={errors.zoneId === undefined ? undefined : true}
                id="zoneId"
                name="zoneId"
                onChange={(event) => form.setData("zoneId", event.target.value)}
                value={form.data.zoneId}
              >
                <option value="">選択してください</option>
                {zones.map((zone) => (
                  <option key={zone.zoneId} value={zone.zoneId}>
                    {zone.zoneId}（{zone.label}）
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="form-grid">
            <WorkerSelect
              error={errors.crewA}
              field="crewA"
              label="隊員 a"
              onChange={(value) => form.setData("crewA", value)}
              value={form.data.crewA}
              workers={workers}
            />
            <WorkerSelect
              error={errors.crewB}
              field="crewB"
              label="隊員 b（相方）"
              onChange={(value) => form.setData("crewB", value)}
              value={form.data.crewB}
              workers={workers}
            />
          </div>
          <FormField
            {...(errors.plannedMinutes === undefined ? {} : { error: errors.plannedMinutes })}
            description="1〜480 分。酸素残時間はこの値に予備60分を足した分が必要です"
            field="plannedMinutes"
            label="予定作業時間（分）"
          >
            <input
              aria-describedby={errors.plannedMinutes === undefined ? undefined : "plannedMinutes-error"}
              aria-invalid={errors.plannedMinutes === undefined ? undefined : true}
              id="plannedMinutes"
              max={480}
              min={1}
              name="plannedMinutes"
              onChange={(event) => form.setData("plannedMinutes", event.target.value)}
              type="number"
              value={form.data.plannedMinutes}
            />
          </FormField>
          <FormField
            {...(errors.purpose === undefined ? {} : { error: errors.purpose })}
            description="作業内容は共有ログに出ません"
            field="purpose"
            label="作業内容"
          >
            <textarea
              aria-describedby={errors.purpose === undefined ? undefined : "purpose-error"}
              aria-invalid={errors.purpose === undefined ? undefined : true}
              id="purpose"
              name="purpose"
              onChange={(event) => form.setData("purpose", event.target.value)}
              value={form.data.purpose}
            />
          </FormField>
          <div className="form-actions">
            <Link className={buttonClassName("secondary")} href="/permits">
              一覧へ戻る
            </Link>
            <button
              aria-busy={form.processing || undefined}
              className={buttonClassName()}
              disabled={form.processing}
              type="submit"
            >
              {form.processing ? "申請中…" : "作業許可を申請"}
            </button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
