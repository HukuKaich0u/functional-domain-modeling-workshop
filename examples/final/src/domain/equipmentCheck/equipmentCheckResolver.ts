import type { ResultAsync } from "neverthrow";

import type { PermitId } from "../permit/index.js";
import type { EquipmentCheck } from "./equipmentCheck.js";

export type EquipmentCheckByPermitIdResolver = Readonly<{
  resolveByPermitId: (permitId: PermitId) => ResultAsync<readonly EquipmentCheck[], never>;
}>;
