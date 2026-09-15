import type { Approach } from "../approach.js";
import { procedural } from "./01-procedural.js";
import { objectOriented } from "./02-object-oriented.js";
import { functional } from "./03-functional.js";
import { typeDriven } from "./04-type-driven.js";
import { dataOriented } from "./05-data-oriented.js";
import { ruleBased } from "./06-rule-based.js";
import { eventDriven } from "./07-event-driven.js";
import { actorModel } from "./08-actor-model.js";
import { reactive } from "./09-reactive.js";
import { logicProgramming } from "./10-logic-programming.js";

/** 企画方針の一覧と同じ順 */
export const approaches: readonly Approach[] = [
  procedural,
  objectOriented,
  functional,
  typeDriven,
  dataOriented,
  ruleBased,
  eventDriven,
  actorModel,
  reactive,
  logicProgramming,
];
