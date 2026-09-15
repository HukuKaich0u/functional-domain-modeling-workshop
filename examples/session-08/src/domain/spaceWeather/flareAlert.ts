export type FlareLevel = "S1" | "S2" | "S3" | "S4" | "S5";

export type FlareAlert =
  | Readonly<{ kind: "Clear" }>
  | Readonly<{ kind: "Active"; level: FlareLevel; issuedAt: string }>;

export const FlareAlert = {
  clear: { kind: "Clear" } as const satisfies FlareAlert,
} as const;
