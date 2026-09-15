import type { LunarDay } from "./lunarDay.js";
import type { Timestamp } from "./timestamp.js";

/** 地球時（UTC）と月面日の二つの時計。規程第9条により作業記録は両方を併記する */
export type Clock = Readonly<{
  now: () => Timestamp;
  lunarDay: () => LunarDay;
}>;
