import type { AggregateStore } from "../aggregate/aggregateStore.js";
import type { SpaceWeatherReported } from "./spaceWeatherEvent.js";

export type SpaceWeatherReportedStore = AggregateStore<SpaceWeatherReported>;
