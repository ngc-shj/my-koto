import { z } from "zod";

// Single 避難場所 (open-air evacuation gathering point) record. Source:
// Tokyo Met `t000003d0000000093` evacuation_area CSV. Each row carries 8
// hazard-type flags ("1" = designated for that hazard, blank/0 = not
// designated). The 避難所 feed does NOT include these flags, so this is
// the only authoritative per-site hazard tagging available.
export const AssemblyPointRecordSchema = z.object({
  名称: z.string(),
  住所: z.string(),
  緯度: z.string(),
  経度: z.string(),
  // 8 hazard flags. Stored as strings to preserve the upstream CSV shape;
  // the normaliser converts them to booleans.
  洪水: z.string().optional(),
  崖崩れ: z.string().optional(),
  高潮: z.string().optional(),
  地震: z.string().optional(),
  津波: z.string().optional(),
  大規模火災: z.string().optional(),
  内水氾濫: z.string().optional(),
  火山現象: z.string().optional(),
  バリアフリー: z.string().optional(),
  備考: z.string().optional(),
});

export const AssemblyPointResponseSchema = z.object({
  result: z.object({
    records: z.array(AssemblyPointRecordSchema),
  }),
});

export type AssemblyPointRecord = z.infer<typeof AssemblyPointRecordSchema>;
export type AssemblyPointResponse = z.infer<typeof AssemblyPointResponseSchema>;
