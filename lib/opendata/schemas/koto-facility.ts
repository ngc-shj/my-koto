import { z } from "zod";

// Generic record shape for Koto-ku 公共施設 datasets that follow the
// 自治体推奨データセット 38列 schema (公園・図書館・児童館・保育園 share it).
// Only the fields we render are required; the upstream CSV has many more
// columns we deliberately don't propagate to keep payloads small.
export const KotoFacilityRecordSchema = z.object({
  名称: z.string(),
  住所: z.string(),
  緯度: z.string(),
  経度: z.string(),
  電話番号: z.string().optional(),
  利用可能日時特記事項: z.string().optional(),
  バリアフリー情報: z.string().optional(),
  URL: z.string().optional(),
  備考: z.string().optional(),
});

export const KotoFacilityResponseSchema = z.object({
  result: z.object({
    records: z.array(KotoFacilityRecordSchema),
  }),
});

export type KotoFacilityRecord = z.infer<typeof KotoFacilityRecordSchema>;
export type KotoFacilityResponse = z.infer<typeof KotoFacilityResponseSchema>;
