import { z } from "zod";

const schema = z.string().regex(/^PV-\d{2}$/).brand<"ZoneId">();

export type ZoneId = z.infer<typeof schema>;
export const ZoneId = { schema, parse: schema.parse } as const;
