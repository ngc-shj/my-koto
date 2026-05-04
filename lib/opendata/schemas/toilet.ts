import { z } from "zod";

// Single public toilet record as returned by Tokyo Open Data API.
export const ToiletRecordSchema = z.object({
  名称: z.string(),
  住所: z.string(),
  緯度: z.string(),
  経度: z.string(),
  バリアフリー: z.string().optional(),
  二十四時間: z.string().optional(),
  男性用: z.string().optional(),
  女性用: z.string().optional(),
  多目的: z.string().optional(),
  備考: z.string().optional(),
});

// API response envelope
export const ToiletResponseSchema = z.object({
  result: z.object({
    records: z.array(ToiletRecordSchema),
  }),
});

export type ToiletRecord = z.infer<typeof ToiletRecordSchema>;
export type ToiletResponse = z.infer<typeof ToiletResponseSchema>;
