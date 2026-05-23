import { z } from "zod";

// JMA bosai/quake/data/list.json shape. The upstream payload carries
// dozens of fields; we only validate the ones the panel reads so future
// additions on the JMA side do not break the schema.

const QuakeCitySchema = z.object({
  code: z.string(),
  maxi: z.string(),
});

const QuakePrefSchema = z.object({
  code: z.string(),
  maxi: z.string(),
  city: z.array(QuakeCitySchema).optional(),
});

export const JmaQuakeEventSchema = z.object({
  eid: z.string(),
  rdt: z.string(),
  ttl: z.string(),
  at: z.string().optional(),
  anm: z.string().optional(),
  mag: z.string().optional(),
  maxi: z.string().optional(),
  int: z.array(QuakePrefSchema).optional(),
});

export const JmaQuakeListSchema = z.array(JmaQuakeEventSchema);

export type JmaQuakeEvent = z.infer<typeof JmaQuakeEventSchema>;
export type JmaQuakeList = z.infer<typeof JmaQuakeListSchema>;
