import { z } from "zod";

const schema = z.string().regex(/^PV-\d{2}$/).brand<"SegmentId">();

export type SegmentId = z.infer<typeof schema>;
export const SegmentId = { schema, parse: schema.parse } as const;
