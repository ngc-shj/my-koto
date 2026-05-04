import { z } from "zod";

// Single 避難所 (designated shelter) record. Source: Tokyo Met
// `t000003d0000000093` evacuation_center CSV. Includes accessibility
// flags but no per-row hazard typing — those live on the 避難場所
// (assembly_point) feed instead.
export const ShelterRecordSchema = z.object({
  名称: z.string(),
  住所: z.string(),
  緯度: z.string(),
  経度: z.string(),
  バリアフリー: z.string().optional(),
  二十四時間: z.string().optional(),
  備考: z.string().optional(),
});

export const ShelterResponseSchema = z.object({
  result: z.object({
    records: z.array(ShelterRecordSchema),
  }),
});

export type ShelterRecord = z.infer<typeof ShelterRecordSchema>;
export type ShelterResponse = z.infer<typeof ShelterResponseSchema>;
