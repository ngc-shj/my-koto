import { z } from "zod";

// Single event record as returned by Tokyo Open Data API.
export const EventRecordSchema = z.object({
  名称: z.string(),
  開始日: z.string(),
  終了日: z.string().optional(),
  場所: z.string().optional(),
  住所: z.string().optional(),
  説明: z.string().optional(),
  URL: z
    .string()
    .optional()
    .refine(
      (v) => {
        if (v === undefined || v === "") return true;
        try {
          return new URL(v).protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "URL must use https scheme" }
    ),
  主催: z.string().optional(),
  備考: z.string().optional(),
});

// API response envelope
export const EventResponseSchema = z.object({
  result: z.object({
    records: z.array(EventRecordSchema),
  }),
});

export type EventRecord = z.infer<typeof EventRecordSchema>;
export type EventResponse = z.infer<typeof EventResponseSchema>;
