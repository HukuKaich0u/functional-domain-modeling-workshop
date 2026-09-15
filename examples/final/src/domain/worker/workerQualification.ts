import { z } from "zod";

import { schemaResult } from "../shared/schemaResult.js";

/** 資格。電気設備の接続作業は電気工の資格を持つ隊員だけが行う */
const WorkerQualificationSchema = z.enum(["Electrician", "General"]);

export type WorkerQualification = z.infer<typeof WorkerQualificationSchema>;

export const WorkerQualification = {
  schema: WorkerQualificationSchema,
  parse: schemaResult(WorkerQualificationSchema),
} as const;
