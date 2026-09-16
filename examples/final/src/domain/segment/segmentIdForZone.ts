import type { ZoneId } from "../permit/index.js";
import { SegmentId } from "./segmentId.js";

/**
 * 教材では各作業区画へ同じ番号の系統区間が給電する（PV-07 → PV-07）。
 * 書式が同じでも用途は別なので、この対応規則を通して SegmentId を作る。
 */
export const segmentIdForZone = (zoneId: ZoneId): SegmentId => SegmentId.schema.parse(zoneId);
