import type { ResultAsync } from "neverthrow";

import type {
  CrewEgressed,
  CrewReturned,
  EvaApproved,
  PermitAborted,
  PermitRequested,
} from "./permitEvent.js";
import type { PermitId } from "./permitId.js";

/** 同じ許可への同時操作、または申請番号の重複。保存側が権威を持って判定する */
export type PermitConflict = Readonly<{
  kind: "PermitConflict";
  permitId: PermitId;
}>;
export type PermitStoreError = PermitConflict;
type PermitStore<TEvent> = Readonly<{
  store: (...events: readonly TEvent[]) => ResultAsync<void, PermitStoreError>;
}>;
export type PermitRequestedStore = PermitStore<PermitRequested>;
export type EvaApprovedStore = PermitStore<EvaApproved>;
export type CrewEgressedStore = PermitStore<CrewEgressed>;
export type CrewReturnedStore = PermitStore<CrewReturned>;
export type PermitAbortedStore = PermitStore<PermitAborted>;
