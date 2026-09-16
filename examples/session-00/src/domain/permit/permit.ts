export type EvaPermit = Readonly<{
  permitId: string;
  zoneId: string;
  crew: readonly string[];
  plannedMinutes: number;
  requestedAt: string;
  status: string;
  segmentId?: string;
  equipmentChecks?: unknown;
  crewExposure?: unknown;
  spaceWeather?: unknown;
  approvedAt?: string;
  approvedBy?: string;
  egressAt?: string;
  returnedAt?: string;
  returnReason?: string;
  lockoutRemovedAt?: string;
  closedAt?: string;
  abortReason?: string;
}>;

export type PermitExtra = Partial<Omit<EvaPermit, "permitId">>;

export type RequestPermitInput = Omit<EvaPermit, "status">;

export const requestPermit = (input: RequestPermitInput): EvaPermit => ({
  ...input,
  status: "requested",
});

export const updateStatus = (
  permit: EvaPermit,
  status: string,
  extra?: PermitExtra,
): EvaPermit => ({ ...permit, ...extra, status });
