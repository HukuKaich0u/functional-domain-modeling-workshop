import type { Segment } from "../domain/segment/index.js";

export type SegmentView = Segment;

export const toSegmentView = (segment: Segment): SegmentView => segment;
