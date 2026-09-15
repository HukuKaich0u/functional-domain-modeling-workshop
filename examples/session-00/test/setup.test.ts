import { describe, expect, it } from "vitest";

import { SpaceWeatherReport } from "../src/boundary/spaceWeatherReport.js";
import {
  requestPermit,
  updateStatus,
  type RequestPermitInput,
} from "../src/domain/permit/permit.js";

const input = {
  permitId: "EVA-0412",
  zoneId: "PV-07",
  crew: ["W-03", "W-04"],
  plannedMinutes: 180,
  requestedAt: "2026-09-15T00:00:00.000Z",
} as const satisfies RequestPermitInput;

describe("Session 00 setup", () => {
  it("未改善の現行システムが帰還済みを作業中へ戻してしまう", () => {
    const returned = updateStatus(requestPermit(input), "returned", {
      returnedAt: "2026-09-15T04:30:00.000Z",
    });

    expect(updateStatus(returned, "outside").status).toBe("outside");
  });

  it("未改善の現行システムが未知の状態と区間の取り違えを受け入れてしまう", () => {
    const permit = updateStatus(requestPermit(input), "waiting-for-sunrise", {
      segmentId: "PV-01",
    });

    expect(permit).toMatchObject({
      status: "waiting-for-sunrise",
      segmentId: "PV-01",
    });
  });

  it("名前だけの入力境界が不正な宇宙天気の報告を受け入れてしまう", () => {
    expect(SpaceWeatherReport.parse({ stations: "not-an-array" })).toEqual({
      stations: "not-an-array",
    });
  });
});
