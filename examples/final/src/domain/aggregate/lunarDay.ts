import { z } from "zod";
import { schemaResult } from "../shared/schemaResult.js";

/** 日の出からの経過日。第1日〜第14日が昼、第15日〜第29日が夜 */
const LunarDaySchema = z.number().int().min(1).max(29).brand<"LunarDay">();

export type LunarDay = z.infer<typeof LunarDaySchema>;

export const LAST_DAYLIGHT_LUNAR_DAY = 14;

export const LunarDay = {
  schema: LunarDaySchema,
  parse: schemaResult(LunarDaySchema),
  isDaytime: (lunarDay: LunarDay): boolean => lunarDay <= LAST_DAYLIGHT_LUNAR_DAY,
} as const;
