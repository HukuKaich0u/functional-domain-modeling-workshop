export type ActionAvailability =
  | Readonly<{
      kind: "Available";
      href: string;
      method: "get" | "post";
      data?: Readonly<Record<string, string>>;
    }>
  | Readonly<{
      kind: "NotImplemented";
      href: string;
      method: "get" | "post";
      data?: Readonly<Record<string, string>>;
    }>
  | Readonly<{ kind: "Hidden" }>;

export type AppointmentActions = Readonly<{
  checkIn: ActionAvailability;
  startExamination: ActionAvailability;
  recordExamResult: ActionAvailability;
  recordPayment: ActionAvailability;
  cancel: ActionAvailability;
  requestFollowUp: ActionAvailability;
}>;

export type IncidentScenario = Readonly<{
  title: string;
  description: string;
  action: Exclude<ActionAvailability, { kind: "Hidden" }>;
}>;

export type DatabaseInspection = Readonly<{
  appointmentJson: string;
  auditLogJson: string;
  warnings: readonly string[];
}>;

export type IncidentLab = Readonly<{
  scenarios: readonly IncidentScenario[];
  inspection: DatabaseInspection;
}>;

export type ClinicAppointmentView = Readonly<{
  appointmentId: string;
  kind: string;
  ownerName: string;
  petName: string;
  scheduledAt: string;
  statusLabel: string;
}>;

export type Notice =
  | Readonly<{ kind: "FeatureNotImplemented" }>
  | Readonly<{ kind: "InvalidAppointmentState" }>
  | Readonly<{ kind: "AppointmentNotFound" }>
  | Readonly<{ kind: "AppointmentConflict" }>
  | null;

export type ClinicPageProps = Readonly<{
  actions: AppointmentActions;
  appointment: ClinicAppointmentView;
  incidentLab?: IncidentLab;
  learningFocus: string;
  notice: Notice;
  sessionLabel: string;
}>;

export type ClinicUserView = Readonly<{
  role: "Admin" | "Receptionist" | "Veterinarian";
}>;

/** MoonBase の役割。Admin はシステム担当、GroundControl は地上管制、BaseCommander は基地長、Electrician は電気主任 */
export type MoonbaseUserView = Readonly<{
  role: "Admin" | "GroundControl" | "BaseCommander" | "Electrician";
}>;

export type PermitActions = Readonly<{
  approve: ActionAvailability;
  egress: ActionAvailability;
  returnToBase: ActionAvailability;
  close: ActionAvailability;
  abort: ActionAvailability;
  exportRollCall: ActionAvailability;
}>;

export type MoonbaseDatabaseInspection = Readonly<{
  permitJson: string;
  workLogJson: string;
  warnings: readonly string[];
}>;

export type MoonbaseIncidentLab = Readonly<{
  scenarios: readonly IncidentScenario[];
  inspection: MoonbaseDatabaseInspection;
}>;

export type MoonbasePermitView = Readonly<{
  permitId: string;
  kind: string;
  zoneId: string;
  crew: readonly string[];
  requestedAt: string;
  statusLabel: string;
}>;

export type MoonbaseNotice =
  | Readonly<{ kind: "FeatureNotImplemented" }>
  | Readonly<{ kind: "InvalidPermitState" }>
  | Readonly<{ kind: "PermitNotFound" }>
  | Readonly<{ kind: "PermitConflict" }>
  | Readonly<{ kind: "DoseLimitExceeded" }>
  | Readonly<{ kind: "FlareAlertActive" }>
  | Readonly<{ kind: "InsufficientOxygen" }>
  | Readonly<{ kind: "NightTime" }>
  | null;

export type MoonbasePageProps = Readonly<{
  actions: PermitActions;
  permit: MoonbasePermitView;
  incidentLab?: MoonbaseIncidentLab;
  learningFocus: string;
  notice: MoonbaseNotice;
  sessionLabel: string;
}>;
