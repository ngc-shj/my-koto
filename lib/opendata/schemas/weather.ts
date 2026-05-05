import { z } from "zod";

// Tokyo locale temperature range: [-15, 45] °C.
// JMA all-time extremes ≈ -10 °C / 39 °C; ±5 °C margin guards climate drift
// while rejecting implausible placeholder values like -50 / 50.
const TemperatureSchema = z.number().min(-15).max(45);

// Apparent (feels-like) temperature has wider range than ambient because of
// wind-chill / heat-index combinations. ±15 °C beyond the ambient bounds.
const ApparentTemperatureSchema = z.number().min(-30).max(60);

// Wind speed in m/s. Tokyo's record gust is roughly 50 m/s; cap at 100 m/s
// to reject placeholder values while leaving headroom for typhoon outliers.
const WindSpeedSchema = z.number().min(0).max(100);

// UV index is a unitless 0..11+ scale per WHO; Open-Meteo reports values up to
// ~14 in extreme tropical conditions. Cap at 15.
const UvIndexSchema = z.number().min(0).max(15);

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
  apparent_temperature: z.array(ApparentTemperatureSchema).optional(),
  relative_humidity_2m: z.array(z.number().int().min(0).max(100)).optional(),
  precipitation_probability: z.array(z.number().min(0).max(100)).optional(),
  weathercode: z.array(WeathercodeSchema).optional(),
});

// Open-Meteo API response for daily summary data.
// Cap time array at 16 entries (16-day forecast horizon).
export const WeatherDailySchema = z.object({
  time: z.array(z.string()).max(16),
  temperature_2m_max: z.array(TemperatureSchema),
  temperature_2m_min: z.array(TemperatureSchema),
  apparent_temperature_max: z.array(ApparentTemperatureSchema).optional(),
  apparent_temperature_min: z.array(ApparentTemperatureSchema).optional(),
  precipitation_probability_max: z
    .array(z.number().min(0).max(100).int())
    .optional(),
  precipitation_sum: z.array(z.number().min(0).max(2000)).optional(),
  weathercode: z.array(WeathercodeSchema).optional(),
  uv_index_max: z.array(UvIndexSchema).optional(),
  // sunrise / sunset are ISO datetime strings keyed by local timezone (Asia/Tokyo).
  // Open-Meteo emits "2026-08-01T05:12" without a Z suffix when timezone≠UTC.
  sunrise: z.array(z.string()).optional(),
  sunset: z.array(z.string()).optional(),
  wind_speed_10m_max: z.array(WindSpeedSchema).optional(),
  wind_gusts_10m_max: z.array(WindSpeedSchema).optional(),
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
