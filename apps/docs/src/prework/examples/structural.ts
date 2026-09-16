type ZoneId = string;
type SegmentId = string;

const segmentId: SegmentId = "SEG-07";
// 別名を付けても、どちらも string。代入は通る。
export const mistakenZoneId: ZoneId = segmentId;

type Zone = Readonly<{ kind: "ZoneId"; value: string }>;
type Segment = Readonly<{ kind: "SegmentId"; value: string }>;

export function readZone(zone: Zone): string {
  return zone.value;
}

export function typeExamples(segment: Segment) {
  // @ts-expect-error: kind が異なるため、Zone として渡せない。
  readZone(segment);
}
