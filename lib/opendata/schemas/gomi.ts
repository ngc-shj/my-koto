import { z } from "zod";

// Weekly collection days for each waste type.
export const WeekdaySchema = z.enum([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

// Single garbage collection schedule record.
export const GomiRecordSchema = z.object({
  地区ID: z.string(),
  地区名: z.string(),
  燃やすごみ: z.array(WeekdaySchema).optional(),
  燃やさないごみ: z.array(WeekdaySchema).optional(),
  プラスチック: z.array(WeekdaySchema).optional(),
  資源ごみ: z.array(WeekdaySchema).optional(),
  粗大ごみ: z.string().optional(),
  備考: z.string().optional(),
});

// API response envelope
export const GomiResponseSchema = z.object({
  result: z.object({
    records: z.array(GomiRecordSchema),
  }),
});

export type Weekday = z.infer<typeof WeekdaySchema>;
export type GomiRecord = z.infer<typeof GomiRecordSchema>;
export type GomiResponse = z.infer<typeof GomiResponseSchema>;
