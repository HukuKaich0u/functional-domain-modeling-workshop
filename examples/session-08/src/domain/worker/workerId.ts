import { z } from "zod";

const schema = z.string().regex(/^W-\d{2}$/).brand<"WorkerId">();

export type WorkerId = z.infer<typeof schema>;
export const WorkerId = { schema, parse: schema.parse } as const;
