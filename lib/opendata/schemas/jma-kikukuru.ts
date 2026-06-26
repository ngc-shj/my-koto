import { z } from "zod";

// JMA キキクル "jmatile/data/risk/targetTimes.json" schema. Each row is a
// time frame for the risk tiles. We only validate the fields we consume to
// build the tile URL prefix; `elements` (the list of available surfaces) is
// kept for shape confidence but not otherwise used.

const KikukuruTargetTimeSchema = z.object({
  basetime: z.string(),
  validtime: z.string(),
  member: z.string(),
  elements: z.array(z.string()).optional(),
});

export const KikukuruTargetTimesSchema = z.array(KikukuruTargetTimeSchema);

export type KikukuruTargetTime = z.infer<typeof KikukuruTargetTimeSchema>;
