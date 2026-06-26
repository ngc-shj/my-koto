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
  // Content update time (YYYYMMDDHHMMSS). JMA emits several reports per
  // event (震度速報 → 震源に関する情報 → 震源・震度情報) that all share one
  // eid; ctt distinguishes the revisions so we can keep only the latest.
  ctt: z.string().optional(),
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
