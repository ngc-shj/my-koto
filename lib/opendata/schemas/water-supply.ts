import { z } from "zod";

// Single 給水拠点 (emergency water supply point) record. Source: Tokyo
// 水道局 `t000019d0000000001`. Koto-ku has 6 sites covering 浄水場・給水所,
// 震災対策用応急給水槽, and 小規模応急給水槽 in 区立公園 / 都立公園.
export const WaterSupplyRecordSchema = z.object({
  名称: z.string(),
  住所: z.string(),
  緯度: z.string(),
  経度: z.string(),
  種別: z.string().optional(), // 浄水場・給水所, 震災対策用応急給水槽, etc.
  確保水量: z.string().optional(), // m³
  備考: z.string().optional(),
});

export const WaterSupplyResponseSchema = z.object({
  result: z.object({
    records: z.array(WaterSupplyRecordSchema),
  }),
});

export type WaterSupplyRecord = z.infer<typeof WaterSupplyRecordSchema>;
export type WaterSupplyResponse = z.infer<typeof WaterSupplyResponseSchema>;
