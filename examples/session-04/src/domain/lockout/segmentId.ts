import { z } from "zod";

const schema = z.string().regex(/^PV-\d{2}$/);

export type SegmentId = z.infer<typeof schema>;
export const SegmentId = { schema, parse: schema.parse } as const;
