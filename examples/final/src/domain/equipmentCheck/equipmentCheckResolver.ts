import type { ResultAsync } from "neverthrow";

import type { PermitId } from "../permit/index.js";
import type { EquipmentCheck } from "./equipmentCheck.js";

export type EquipmentCheckByPermitIdResolver = Readonly<{
  /** 隊員ごとの最新の点検を返す。同じ点検時刻なら、後から保存した記録を採用する */
  resolveByPermitId: (permitId: PermitId) => ResultAsync<readonly EquipmentCheck[], never>;
}>;
