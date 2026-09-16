import { router } from "@inertiajs/react";
import type { ReactElement } from "react";

import type {
  ActionAvailability,
  MoonbaseIncidentLab,
  MoonbaseNotice,
  MoonbasePageProps,
  PermitActions,
} from "./contracts.js";

type ActionKey = keyof PermitActions;

const actionLabels: Readonly<Record<ActionKey, string>> = {
  approve: "開始を承認する",
  egress: "出発を記録する",
  returnToBase: "帰還を記録する",
  close: "完了にする",
  abort: "中止する",
  exportRollCall: "点呼表を出力する",
};

const noticeMessages: Readonly<
  Record<Exclude<MoonbaseNotice, null>["kind"], string>
> = {
  FeatureNotImplemented: "この機能は未実装です",
  InvalidPermitState: "現在の作業許可の状態ではこの操作を実行できません",
  PermitNotFound: "作業許可が見つかりません",
  PermitConflict: "作業許可がほかの操作によって更新されました",
  ExposureLimitExceeded: "作業後の被ばく量が安全上限を超えるため承認できません",
  FlareAlertActive: "フレア警報の発令中は承認できません",
  InsufficientOxygen: "酸素残時間が不足しているため承認できません",
  NightTime: "夜間は船外作業を承認できません",
};

const visit = (
  action: Exclude<ActionAvailability, { kind: "Hidden" }>,
): void => {
  router.visit(action.href, {
    method: action.method,
    data: action.data ?? {},
    preserveScroll: true,
  });
};

const ActionButton = ({
  action,
  label,
}: Readonly<{
  action: ActionAvailability;
  label: string;
}>): ReactElement | null => {
  if (action.kind === "Hidden") {
    return null;
  }

  const isNotImplemented = action.kind === "NotImplemented";
  return (
    <button
      className={
        isNotImplemented
          ? "button button--secondary demo-action demo-action--not-implemented"
          : "button button--primary demo-action"
      }
      onClick={() => visit(action)}
      type="button"
    >
      <span>{label}</span>
      {isNotImplemented ? (
        <span className="demo-action__status">未実装</span>
      ) : null}
    </button>
  );
};

const NoticeDialog = ({
  notice,
}: Readonly<{ notice: MoonbaseNotice }>): ReactElement | null =>
  notice === null ? null : (
    <dialog className="notice-dialog" open>
      <h2>操作のお知らせ</h2>
      <p>{noticeMessages[notice.kind]}</p>
      <button
        className="button button--primary"
        onClick={() => router.visit("/", { replace: true })}
        type="button"
      >
        閉じる
      </button>
    </dialog>
  );

const IncidentLabPanel = ({
  incidentLab,
}: Readonly<{
  incidentLab: MoonbaseIncidentLab;
}>): ReactElement => (
  <section
    className="surface-card incident-lab"
    aria-labelledby="incident-lab-heading"
  >
    <h2 id="incident-lab-heading">事故再現</h2>
    <div className="incident-lab__scenarios">
      {incidentLab.scenarios.map((scenario) => (
        <article className="incident-lab__scenario" key={scenario.title}>
          <div>
            <h3>{scenario.title}</h3>
            <p>{scenario.description}</p>
          </div>
          <ActionButton action={scenario.action} label="実行する" />
        </article>
      ))}
    </div>
    <div className="incident-lab__inspection">
      <section aria-labelledby="database-permit-heading">
        <h3 id="database-permit-heading">現在の作業許可</h3>
        <pre>{incidentLab.inspection.permitJson}</pre>
      </section>
      <section aria-labelledby="database-work-log-heading">
        <h3 id="database-work-log-heading">作業記録</h3>
        <pre>{incidentLab.inspection.workLogJson}</pre>
      </section>
      <section aria-labelledby="database-warnings-heading">
        <h3 id="database-warnings-heading">不整合の警告</h3>
        <ul>
          {incidentLab.inspection.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
    </div>
  </section>
);

export const MoonbaseDashboard = ({
  actions,
  permit,
  incidentLab,
  learningFocus,
  notice,
  sessionLabel,
}: MoonbasePageProps): ReactElement => (
  <main className="demo-page">
    <header className="page-header demo-page__header">
      <div>
        <p className="demo-page__session">{sessionLabel}</p>
        <h1>MoonBase 作業管理</h1>
        <p className="page-header__description">{learningFocus}</p>
      </div>
      <form action="/demo/reset" method="post">
        <button className="button button--ghost" type="submit">
          デモを初期状態へ戻す
        </button>
      </form>
    </header>

    <section
      className="surface-card demo-permit"
      aria-labelledby="permit-heading"
    >
      <div className="demo-permit__heading">
        <div>
          <p className="demo-permit__eyebrow">本日の船外作業</p>
          <h2 id="permit-heading">{permit.zoneId} 接続作業</h2>
        </div>
        <span className="status-badge status-badge--info">
          {permit.statusLabel}
        </span>
      </div>
      <dl className="demo-permit__details">
        <div>
          <dt>許可番号</dt>
          <dd>{permit.permitId}</dd>
        </div>
        <div>
          <dt>作業員</dt>
          <dd>{permit.crew.join(" / ")}</dd>
        </div>
        <div>
          <dt>申請時刻</dt>
          <dd>{permit.requestedAt}</dd>
        </div>
        <div>
          <dt>状態</dt>
          <dd>{permit.kind}</dd>
        </div>
      </dl>
      <div className="demo-permit__actions" aria-label="作業許可の操作">
        {(Object.keys(actionLabels) as ActionKey[]).map((key) => (
          <ActionButton
            action={actions[key]}
            key={key}
            label={actionLabels[key]}
          />
        ))}
      </div>
    </section>

    {incidentLab === undefined ? null : (
      <IncidentLabPanel incidentLab={incidentLab} />
    )}

    <NoticeDialog notice={notice} />
  </main>
);

export default MoonbaseDashboard;
