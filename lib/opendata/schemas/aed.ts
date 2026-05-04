import { z } from "zod";

// Single AED facility record as returned by Tokyo Open Data API.
export const AedRecordSchema = z.object({
  名称: z.string(),
  住所: z.string(),
  緯度: z.string(),
  経度: z.string(),
  設置場所詳細: z.string().optional(),
  利用可能時間: z.string().optional(),
  電話番号: z.string().optional(),
  備考: z.string().optional(),
});

// API response envelope
export const AedResponseSchema = z.object({
  result: z.object({
    records: z.array(AedRecordSchema),
  }),
});

export type AedRecord = z.infer<typeof AedRecordSchema>;
export type AedResponse = z.infer<typeof AedResponseSchema>;
