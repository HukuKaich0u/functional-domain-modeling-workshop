import type { SanitizedAuditValue } from "../../../../../domain/audit/eventHistoryReader.js";
import type { EventView } from "../../../../../useCase/listEventsUseCase.js";
import { DataTable, EmptyState, InlineAlert } from "@moonbase/base-web";
import type { SharedPageProps } from "../../pageProps.js";
import Layout from "../Layout.js";

type Props = SharedPageProps & Readonly<{ events: readonly EventView[] }>;

const Fields = ({ value }: Readonly<{
  value: Readonly<Record<string, SanitizedAuditValue>> | undefined;
}>) => {
  if (value === undefined) return <span>なし</span>;
  const fields = Object.entries(value);
  return fields.length === 0 ? (
    <span>なし</span>
  ) : (
    <dl className="audit-fields">
      {fields.map(([key, item]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{String(item)}</dd>
        </div>
      ))}
    </dl>
  );
};

export default function EventsIndex({ auth, events }: Props) {
  return (
    <Layout activeNavigation="events" title="作業記録" user={auth.user}>
      <InlineAlert>
        作業記録には被ばく量、作業内容、中止や緊急帰還の理由、点検所見を表示しません。伏せた値は [REDACTED] と出ます。地球時と月面日を併記します（規程第9条）。
      </InlineAlert>
      {events.length === 0 ? (
        <EmptyState>作業記録はありません。</EmptyState>
      ) : (
        <DataTable label="作業記録一覧">
          <thead>
            <tr>
              <th scope="col">地球時（UTC）</th>
              <th scope="col">月面日</th>
              <th scope="col">記録 ID</th>
              <th scope="col">イベント名</th>
              <th scope="col">集約</th>
              <th scope="col">実行者</th>
              <th scope="col">状態</th>
              <th scope="col">ペイロード</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.eventId}>
                <td>{event.occurredAt}</td>
                <td>{`第${event.lunarDay}日`}</td>
                <td>{event.eventId}</td>
                <td>{event.eventName}</td>
                <td>{event.aggregateName}<br /><small>{event.aggregateId}</small></td>
                <td>{event.actorUserId}</td>
                <td><Fields value={event.aggregateState} /></td>
                <td><Fields value={event.eventPayload} /></td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </Layout>
  );
}
