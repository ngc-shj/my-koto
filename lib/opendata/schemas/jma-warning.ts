import { z } from "zod";

// JMA "warning/{prefecture}.json" schema. Only the fields we consume are
// validated; the upstream payload contains additional time-series detail
// (sea level, levels per local area, etc.) that we deliberately skip.

const WarningEntrySchema = z.object({
  code: z.string().optional(),
  status: z.string(),
});

const AreaSchema = z.object({
  code: z.string(),
  warnings: z.array(WarningEntrySchema),
});

const AreaTypeSchema = z.object({
  areas: z.array(AreaSchema),
});

export const JmaWarningResponseSchema = z.object({
  reportDatetime: z.string(),
  publishingOffice: z.string().optional(),
  headlineText: z.string().optional(),
  areaTypes: z.array(AreaTypeSchema),
});

export type JmaWarningResponse = z.infer<typeof JmaWarningResponseSchema>;
export type JmaWarningEntry = z.infer<typeof WarningEntrySchema>;
export type JmaArea = z.infer<typeof AreaSchema>;
