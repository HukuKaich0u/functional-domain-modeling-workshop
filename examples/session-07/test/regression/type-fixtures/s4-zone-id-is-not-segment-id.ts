// @ts-nocheck
import { SegmentId } from "../../../src/domain/lockout/index.js";
import { ZoneId } from "../../../src/domain/permit/index.js";
import { moonbaseFixture } from "../../../../fixtures/moonbase.js";

const zoneId = ZoneId.parse(moonbaseFixture.zoneId);
const segmentId = SegmentId.parse(moonbaseFixture.segmentId);
const acceptZoneId = (_id: ZoneId): void => undefined;
const acceptSegmentId = (_id: SegmentId): void => undefined;

// @ts-expect-error SegmentIdをZoneIdとして使えません。
acceptZoneId(segmentId);

// @ts-expect-error ZoneIdをSegmentIdとして使えません。
acceptSegmentId(zoneId);
