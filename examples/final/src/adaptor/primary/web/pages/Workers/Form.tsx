import { Link, useForm } from "@inertiajs/react";
import type { FormEvent } from "react";

import { buttonClassName, Card, ErrorSummary, FormField } from "@moonbase/base-web";
import type { SharedPageProps } from "../../pageProps.js";
import type { WorkerPageView } from "../../routes/workerRoutes.js";
import Layout from "../Layout.js";

type WorkerFormProps = SharedPageProps &
  Readonly<{
    mode: "create" | "edit";
    worker: WorkerPageView | null;
  }>;

export default function WorkerForm({ auth, errors, mode, worker }: WorkerFormProps) {
  const form = useForm({
    workerId: worker?.workerId ?? "",
    qualification: worker?.qualification ?? "General",
    radiationExposureMicroSv: worker === null ? "0" : String(worker.radiationExposureMicroSv),
  });
  const setQualification = (value: string) => {
    switch (value) {
      case "Electrician":
      case "General":
        form.setData("qualification", value);
        return;
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "create") {
      form.post("/workers", { forceFormData: true });
      return;
    }
    if (worker !== null) {
      form.post(`/workers/${worker.workerId}`, { forceFormData: true });
    }
  };

  return (
    <Layout
      activeNavigation="workers"
      title={mode === "create" ? "隊員を登録" : "隊員の詳細・編集"}
      user={auth.user}
    >
      <ErrorSummary errors={errors} />
      <Card className="management-form-card">
        <form aria-label={mode === "create" ? "隊員登録" : "隊員編集"} className="form-stack" onSubmit={submit}>
          <FormField
            {...(errors.workerId === undefined ? {} : { error: errors.workerId })}
            description="W-03 の形。個人名は登録しません"
            field="workerId"
            label="隊員番号"
          >
            <input
              aria-describedby={errors.workerId === undefined ? undefined : "workerId-error"}
              aria-invalid={errors.workerId === undefined ? undefined : true}
              id="workerId"
              name="workerId"
              onChange={(event) => form.setData("workerId", event.target.value)}
              placeholder="W-03"
              readOnly={mode === "edit"}
              required
              type="text"
              value={form.data.workerId}
            />
          </FormField>
          <FormField
            {...(errors.qualification === undefined ? {} : { error: errors.qualification })}
            field="qualification"
            label="資格"
          >
            <select
              aria-describedby={errors.qualification === undefined ? undefined : "qualification-error"}
              aria-invalid={errors.qualification === undefined ? undefined : true}
              id="qualification"
              name="qualification"
              onChange={(event) => setQualification(event.target.value)}
              value={form.data.qualification}
            >
              <option value="General">General（一般）</option>
              <option value="Electrician">Electrician（電気主任）</option>
            </select>
          </FormField>
          <FormField
            {...(errors.radiationExposureMicroSv === undefined ? {} : { error: errors.radiationExposureMicroSv })}
            description="今回の滞在でこれまでに浴びた量。医務が管理し、安全上限は50,000 µSv"
            field="radiationExposureMicroSv"
            label="被ばく量（µSv）"
          >
            <input
              aria-describedby={errors.radiationExposureMicroSv === undefined ? undefined : "radiationExposureMicroSv-error"}
              aria-invalid={errors.radiationExposureMicroSv === undefined ? undefined : true}
              id="radiationExposureMicroSv"
              min={0}
              name="radiationExposureMicroSv"
              onChange={(event) => form.setData("radiationExposureMicroSv", event.target.value)}
              required
              type="number"
              value={form.data.radiationExposureMicroSv}
            />
          </FormField>
          <div className="form-actions">
            <Link className={buttonClassName("secondary")} href="/workers">隊員一覧へ戻る</Link>
            <button
              aria-busy={form.processing || undefined}
              className={buttonClassName()}
              disabled={form.processing}
              type="submit"
            >
              {mode === "create" ? "登録" : "更新"}
            </button>
          </div>
        </form>
      </Card>
    </Layout>
  );
}
