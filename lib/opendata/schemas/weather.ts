import { z } from "zod";

// Tokyo locale temperature range: [-15, 45] °C.
// JMA all-time extremes ≈ -10 °C / 39 °C; ±5 °C margin guards climate drift
// while rejecting implausible placeholder values like -50 / 50.
const TemperatureSchema = z.number().min(-15).max(45);

// WMO 4677 weather interpretation codes documented at open-meteo.com/en/docs.
export const WMO_CODES = new Set<number>([
  0, 1, 2, 3, 45, 48,
  51, 53, 55, 56, 57,
  61, 63, 65, 66, 67,
  71, 73, 75, 77,
  80, 81, 82, 85, 86,
  95, 96, 99,
]);

const WeathercodeSchema = z.number().int().refine(
  (v) => WMO_CODES.has(v),
  { message: "weathercode must be a valid WMO 4677 code" },
);

// Open-Meteo API response for hourly forecast data.
// Cap time array at 24 * 16 entries (16 days × 24 h) to prevent JSON-size DoS.
export const WeatherHourlySchema = z.object({
  time: z.array(z.string()).max(24 * 16),
  temperature_2m: z.array(TemperatureSchema),
  precipitation_probability: z.array(z.number().min(0).max(100)).optional(),
  weathercode: z.array(WeathercodeSchema).optional(),
});

// Open-Meteo API response for daily summary data.
// Cap time array at 16 entries (16-day forecast horizon).
export const WeatherDailySchema = z.object({
  time: z.array(z.string()).max(16),
  temperature_2m_max: z.array(TemperatureSchema),
  temperature_2m_min: z.array(TemperatureSchema),
  precipitation_probability_max: z
    .array(z.number().min(0).max(100).int())
    .optional(),
  weathercode: z.array(WeathercodeSchema).optional(),
});

// Top-level Open-Meteo API response.
export const WeatherResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
  hourly: WeatherHourlySchema.optional(),
  daily: WeatherDailySchema.optional(),
});

export type WeatherHourly = z.infer<typeof WeatherHourlySchema>;
export type WeatherDaily = z.infer<typeof WeatherDailySchema>;
export type WeatherResponse = z.infer<typeof WeatherResponseSchema>;
