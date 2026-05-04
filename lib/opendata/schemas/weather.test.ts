import { describe, it, expect } from "vitest";
import { WeatherResponseSchema } from "./weather";
import validFixture from "@/__fixtures__/schemas/weather/valid.json";
import invalidFixture from "@/__fixtures__/schemas/weather/invalid.json";

describe("WeatherResponseSchema", () => {
  it("accepts a valid weather response fixture", () => {
    const result = WeatherResponseSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid weather response fixture (temperature > 50)", () => {
    const result = WeatherResponseSchema.safeParse(invalidFixture);
    expect(result.success).toBe(false);
  });

  it("rejects temperature below -50", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: ["2026-08-01T00:00"],
        temperature_2m: [-60],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts temperature at boundary (-50 and 50)", () => {
    const result = WeatherResponseSchema.safeParse({
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: ["2026-08-01T00:00", "2026-08-01T01:00"],
        temperature_2m: [-50, 50],
      },
    });
    expect(result.success).toBe(true);
  });
});
