import { z } from "zod";

// Temperature range: -50 to 50 degrees Celsius.
const TemperatureSchema = z.number().min(-50).max(50);

// Open-Meteo API response for hourly forecast data.
export const WeatherHourlySchema = z.object({
  time: z.array(z.string()),
  temperature_2m: z.array(TemperatureSchema),
  precipitation_probability: z.array(z.number().min(0).max(100)).optional(),
  weathercode: z.array(z.number().int().min(0)).optional(),
});

// Open-Meteo API response for daily summary data.
export const WeatherDailySchema = z.object({
  time: z.array(z.string()),
  temperature_2m_max: z.array(TemperatureSchema),
  temperature_2m_min: z.array(TemperatureSchema),
  precipitation_probability_max: z.array(z.number().min(0).max(100)).optional(),
  weathercode: z.array(z.number().int().min(0)).optional(),
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
