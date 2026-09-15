import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";
import type { Timestamp } from "../aggregate/timestamp.js";

/** 地上管制が出す警報レベル。none 以外はすべてフレア警報中として扱う（規程第5条） */
const FlareAlertLevelSchema = z.enum(["none", "S1", "S2", "S3", "S4", "S5"]);

export type FlareAlertLevel = z.infer<typeof FlareAlertLevelSchema>;

export const FlareAlertLevel = {
  schema: FlareAlertLevelSchema,
  parse: schemaResult(FlareAlertLevelSchema),
} as const;

export type FlareAlert =
  | Readonly<{ kind: "Clear" }>
  | Readonly<{ kind: "Active"; level: Exclude<FlareAlertLevel, "none">; issuedAt: Timestamp }>;
