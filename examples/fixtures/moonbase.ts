export const moonbaseFixture = {
  permitId: "EVA-0412",
  zoneId: "PV-07",
  segmentId: "PV-07",
  wrongSegmentId: "PV-01",
  crew: ["W-03", "W-04"],
  plannedMinutes: 180,
  oxygenMinutes: 300,
  doseLimitMicroSv: 50_000,
  crewDoseMicroSv: { "W-03": 31_500, "W-04": 44_000 } as Readonly<
    Record<string, number>
  >,
  requestedAt: "2026-09-15T00:00:00.000Z",
  checkedAt: "2026-09-15T00:40:00.000Z",
  approvedAt: "2026-09-15T01:00:00.000Z",
  egressAt: "2026-09-15T01:30:00.000Z",
  returnedAt: "2026-09-15T04:30:00.000Z",
  lockoutRemovedAt: "2026-09-15T04:45:00.000Z",
  closedAt: "2026-09-15T05:00:00.000Z",
  abortedAt: "2026-09-15T00:50:00.000Z",
  lunarDay: 1,
  eventId: "55555555-5555-4555-8555-555555555555",
} as const;
