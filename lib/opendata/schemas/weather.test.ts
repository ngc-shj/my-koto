import { describe, it, expect } from "vitest";
import { WeatherResponseSchema, WMO_CODES } from "./weather";
import validFixture from "@/__fixtures__/schemas/weather/valid.json";
import invalidFixture from "@/__fixtures__/schemas/weather/invalid.json";

describe("WeatherResponseSchema", () => {
  it("accepts a valid weather response fixture", () => {
    const result = WeatherResponseSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid weather response fixture (temperature > 45)", () => {
    const result = WeatherResponseSchema.safeParse(invalidFixture);
    expect(result.success).toBe(false);
  });

  it("rejects temperature below -15 (C8 tightened lower bound)", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: ["2026-08-01T00:00"],
        temperature_2m: [-50],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects temperature above 45 (C8 tightened upper bound)", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      daily: {
        time: ["2026-08-01"],
        temperature_2m_max: [49],
        temperature_2m_min: [25],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts temperature within new bounds (38 °C is valid)", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      daily: {
        time: ["2026-08-01"],
        temperature_2m_max: [38],
        temperature_2m_min: [25],
      },
    });
    expect(result.success).toBe(true);
  });

  // C8: old test updated to assert new boundary [-15, 45].
  it("accepts temperature at new boundary (-15 and 45)", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: ["2026-08-01T00:00", "2026-08-01T01:00"],
        temperature_2m: [-15, 45],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects weathercode 7 (not in WMO allowlist)", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      daily: {
        time: ["2026-08-01"],
        temperature_2m_max: [30],
        temperature_2m_min: [20],
        weathercode: [7],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts weathercode 95 (valid WMO code for thunderstorm)", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      daily: {
        time: ["2026-08-01"],
        temperature_2m_max: [30],
        temperature_2m_min: [20],
        weathercode: [95],
      },
    });
    expect(result.success).toBe(true);
  });

  it("WMO_CODES set contains expected codes", () => {
    expect(WMO_CODES.has(0)).toBe(true);
    expect(WMO_CODES.has(95)).toBe(true);
    expect(WMO_CODES.has(7)).toBe(false);
    expect(WMO_CODES.has(4)).toBe(false);
  });

  it("rejects hourly time array exceeding 24*16 entries", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: Array.from({ length: 24 * 16 + 1 }, (_, i) => `2026-08-01T${String(i % 24).padStart(2, "0")}:00`),
        temperature_2m: Array.from({ length: 24 * 16 + 1 }, () => 25),
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects daily time array exceeding 16 entries", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      daily: {
        time: Array.from({ length: 17 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`),
        temperature_2m_max: Array.from({ length: 17 }, () => 30),
        temperature_2m_min: Array.from({ length: 17 }, () => 20),
      },
    });
    expect(result.success).toBe(false);
  });

  it("verifies precipitation_probability_max rejects non-integer values", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      daily: {
        time: ["2026-08-01"],
        temperature_2m_max: [30],
        temperature_2m_min: [20],
        precipitation_probability_max: [30.5],
      },
    });
    expect(result.success).toBe(false);
  });

  describe("extended fields", () => {
    function withDaily(extra: Record<string, unknown>) {
      return {
        latitude: 35.6727,
        longitude: 139.8175,
        timezone: "Asia/Tokyo",
        daily: {
          time: ["2026-08-01"],
          temperature_2m_max: [35.0],
          temperature_2m_min: [25.0],
          ...extra,
        },
      };
    }

    it("accepts apparent_temperature within wider bounds", () => {
      const result = WeatherResponseSchema.safeParse({
        latitude: 35.6727,
        longitude: 139.8175,
        timezone: "Asia/Tokyo",
        hourly: {
          time: ["2026-08-01T00:00"],
          temperature_2m: [30],
          apparent_temperature: [55],
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects apparent_temperature beyond -30..60", () => {
      const result = WeatherResponseSchema.safeParse({
        latitude: 35.6727,
        longitude: 139.8175,
        timezone: "Asia/Tokyo",
        hourly: {
          time: ["2026-08-01T00:00"],
          temperature_2m: [30],
          apparent_temperature: [70],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects relative_humidity_2m above 100", () => {
      const result = WeatherResponseSchema.safeParse({
        latitude: 35.6727,
        longitude: 139.8175,
        timezone: "Asia/Tokyo",
        hourly: {
          time: ["2026-08-01T00:00"],
          temperature_2m: [30],
          relative_humidity_2m: [101],
        },
      });
      expect(result.success).toBe(false);
    });

    it("rejects non-integer humidity", () => {
      const result = WeatherResponseSchema.safeParse({
        latitude: 35.6727,
        longitude: 139.8175,
        timezone: "Asia/Tokyo",
        hourly: {
          time: ["2026-08-01T00:00"],
          temperature_2m: [30],
          relative_humidity_2m: [65.5],
        },
      });
      expect(result.success).toBe(false);
    });

    it("accepts uv_index_max within 0..15", () => {
      const result = WeatherResponseSchema.safeParse(
        withDaily({ uv_index_max: [11.5] }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects uv_index_max above 15", () => {
      const result = WeatherResponseSchema.safeParse(
        withDaily({ uv_index_max: [20] }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts wind_speed_10m_max and wind_gusts_10m_max", () => {
      const result = WeatherResponseSchema.safeParse(
        withDaily({
          wind_speed_10m_max: [4.2],
          wind_gusts_10m_max: [55.0],
        }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects negative wind speed", () => {
      const result = WeatherResponseSchema.safeParse(
        withDaily({ wind_speed_10m_max: [-1] }),
      );
      expect(result.success).toBe(false);
    });

    it("accepts sunrise/sunset ISO strings", () => {
      const result = WeatherResponseSchema.safeParse(
        withDaily({
          sunrise: ["2026-08-01T04:48"],
          sunset: ["2026-08-01T18:34"],
        }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts precipitation_sum at 0", () => {
      const result = WeatherResponseSchema.safeParse(
        withDaily({ precipitation_sum: [0] }),
      );
      expect(result.success).toBe(true);
    });
  });
});
