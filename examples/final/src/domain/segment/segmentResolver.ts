import type { ResultAsync } from "neverthrow";

import type { Segment } from "./segment.js";
import type { SegmentId } from "./segmentId.js";

export type SegmentByIdResolver = Readonly<{
  resolveById: (segmentId: SegmentId) => ResultAsync<Segment | undefined, never>;
}>;

export type SegmentListResolver = Readonly<{
  resolveAll: () => ResultAsync<readonly Segment[], never>;
}>;
