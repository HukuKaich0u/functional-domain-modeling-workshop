import { useForm } from "@inertiajs/react";
import type { FormEvent } from "react";

import {
  buttonClassName,
  Card,
  DataTable,
  EmptyState,
  ErrorSummary,
  FormField,
  InlineAlert,
  StatusBadge,
} from "@moonbase/base-web";
import { alertLevelPresentation } from "../../components/permitPresentation.js";
import type { SharedPageProps } from "../../pageProps.js";
import type { SpaceWeatherPageView } from "../../routes/spaceWeatherRoutes.js";
import Layout from "../Layout.js";

type Props = SharedPageProps & Readonly<{ reports: readonly SpaceWeatherPageView[] }>;

const alertLevels = ["none", "S1", "S2", "S3", "S4", "S5"] as const;

export default function SpaceWeatherIndex({ auth, errors, reports }: Props) {
  const form = useForm({ issuedAt: "", alertLevel: "none", stations: "" });
  const canReport = auth.user?.role === "Admin" || auth.user?.role === "GroundControl";
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    form.post("/space-weather", { forceFormData: true, preserveScroll: true });
  };
  const current = reports[0];

  return (
    <Layout activeNavigation="space-weather" title="宇宙天気" user={auth.user}>
      <ErrorSummary errors={errors} />
      {current === undefined ? (
        <InlineAlert>宇宙天気の報告がありません。報告が届くまで開始承認は止まります。</InlineAlert>
      ) : (
        <InlineAlert>
          現在の宇宙天気: {alertLevelPresentation(current.alertLevel).label}（{current.issuedAt} 発令）
        </InlineAlert>
      )}
      <div className="settings-grid">
        <section aria-label="報告一覧">
          <Card>
            <h2>報告一覧</h2>
            {reports.length === 0 ? (
              <EmptyState>報告はありません。</EmptyState>
            ) : (
              <DataTable label="宇宙天気の報告一覧">
                <thead>
                  <tr>
                    <th scope="col">発令時刻</th>
                    <th scope="col">警報レベル</th>
                    <th scope="col">観測局</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((report) => {
                    const status = alertLevelPresentation(report.alertLevel);
                    return (
                      <tr key={report.reportId}>
                        <td>{report.issuedAt}</td>
                        <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                        <td>{report.stations.join(", ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            )}
          </Card>
        </section>
        {canReport ? (
          <section aria-label="宇宙天気を報告">
            <Card className="management-form-card">
              <h2>宇宙天気を報告</h2>
              <p>地上管制の外部 JSON を貼り付ける代わりに、同じ境界を通るフォームです。</p>
              <form aria-label="宇宙天気報告" className="form-stack" onSubmit={submit}>
                <FormField
                  {...(errors.issuedAt === undefined ? {} : { error: errors.issuedAt })}
                  description="ISO 8601（例: 2026-09-15T00:00:00.000Z）"
                  field="issuedAt"
                  label="発令時刻"
                >
                  <input
                    aria-describedby={errors.issuedAt === undefined ? undefined : "issuedAt-error"}
                    aria-invalid={errors.issuedAt === undefined ? undefined : true}
                    id="issuedAt"
                    name="issuedAt"
                    onChange={(event) => form.setData("issuedAt", event.target.value)}
                    required
                    value={form.data.issuedAt}
                  />
                </FormField>
                <FormField
                  {...(errors.alertLevel === undefined ? {} : { error: errors.alertLevel })}
                  field="alertLevel"
                  label="警報レベル"
                >
                  <select
                    id="alertLevel"
                    name="alertLevel"
                    onChange={(event) => form.setData("alertLevel", event.target.value)}
                    value={form.data.alertLevel}
                  >
                    {alertLevels.map((level) => (
                      <option key={level} value={level}>{level === "none" ? "none（警報なし）" : level}</option>
                    ))}
                  </select>
                </FormField>
                <FormField
                  {...(errors.stations === undefined ? {} : { error: errors.stations })}
                  description="カンマ区切り"
                  field="stations"
                  label="観測局"
                >
                  <input
                    aria-describedby={errors.stations === undefined ? undefined : "stations-error"}
                    aria-invalid={errors.stations === undefined ? undefined : true}
                    id="stations"
                    name="stations"
                    onChange={(event) => form.setData("stations", event.target.value)}
                    placeholder="GOES-19, ACE"
                    value={form.data.stations}
                  />
                </FormField>
                <div className="form-actions">
                  <button
                    aria-busy={form.processing || undefined}
                    className={buttonClassName()}
                    disabled={form.processing}
                    type="submit"
                  >
                    {form.processing ? "報告中…" : "報告する"}
                  </button>
                </div>
              </form>
            </Card>
          </section>
        ) : null}
      </div>
    </Layout>
  );
}
