import type { EvaPermit as EvaPermitState } from "./permit.js";
import { EvaPermit as permitTransitions } from "./transitions.js";

export type EvaPermit = EvaPermitState;
export const EvaPermit = permitTransitions;
