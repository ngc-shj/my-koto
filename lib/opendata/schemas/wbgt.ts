import { z } from "zod";

// Single WBGT (Wet Bulb Globe Temperature) reading.
// Values are in degrees Celsius and must be in the range 0–50.
export const WbgtReadingSchema = z.object({
  station: z.string(),
  datetime: z.string(),
  wbgt: z.number().min(0).max(50),
});

// Normalized WBGT data file stored at data/wbgt.json.
export const WbgtDataSchema = z.object({
  fetchedAt: z.string(),
  readings: z.array(WbgtReadingSchema),
});

export type WbgtReading = z.infer<typeof WbgtReadingSchema>;
export type WbgtData = z.infer<typeof WbgtDataSchema>;
