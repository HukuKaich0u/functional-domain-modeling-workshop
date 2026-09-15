import { z } from "zod";

const schema = z.string().regex(/^EVA-\d{4}$/).brand<"PermitId">();

export type PermitId = z.infer<typeof schema>;
export const PermitId = { schema, parse: schema.parse } as const;
