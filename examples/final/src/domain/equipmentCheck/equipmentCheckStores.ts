import type { AggregateStore } from "../aggregate/aggregateStore.js";
import type { EquipmentCheckRecorded } from "./equipmentCheckEvent.js";

export type EquipmentCheckRecordedStore = AggregateStore<EquipmentCheckRecorded>;
