import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildWeatherUrl,
  validateUpstreamHost,
  fetchWeather,
  OPEN_METEO_BASE,
  WEATHER_ALLOWED_HOSTS,
  KOTO_CENTER,
} from "./weather";
import type { LatLng } from "./weather";

// ---------------------------------------------------------------------------
// buildWeatherUrl
// ---------------------------------------------------------------------------

describe("buildWeatherUrl", () => {
  it("includes the Koto City coordinates", () => {
    const url = buildWeatherUrl(KOTO_CENTER);
    expect(url.searchParams.get("latitude")).toBe(String(KOTO_CENTER.lat));
    expect(url.searchParams.get("longitude")).toBe(String(KOTO_CENTER.lng));
  });

  it("Koto center lat/lng matches plan values (35.6727, 139.8175)", () => {
    const url = buildWeatherUrl(KOTO_CENTER);
    expect(url.searchParams.get("latitude")).toBe("35.6727");
    expect(url.searchParams.get("longitude")).toBe("139.8175");
  });

  it("uses the default Open-Meteo base URL", () => {
    const url = buildWeatherUrl(KOTO_CENTER);
    expect(url.origin + url.pathname).toBe(OPEN_METEO_BASE);
  });

  it("sets timezone to Asia/Tokyo", () => {
    const url = buildWeatherUrl(KOTO_CENTER);
    expect(url.searchParams.get("timezone")).toBe("Asia/Tokyo");
  });

  it("includes required hourly parameters", () => {
    const url = buildWeatherUrl(KOTO_CENTER);
    expect(url.searchParams.get("hourly")).toContain("temperature_2m");
    expect(url.searchParams.get("hourly")).toContain("precipitation_probability");
  });

  it("includes required daily parameters", () => {
    const url = buildWeatherUrl(KOTO_CENTER);
    const daily = url.searchParams.get("daily") ?? "";
    expect(daily).toContain("temperature_2m_max");
    expect(daily).toContain("temperature_2m_min");
  });

  it("respects a custom base URL", () => {
    const coord: LatLng = { lat: 35.0, lng: 139.0 };
    const url = buildWeatherUrl(coord, "https://custom.example.com/v1/forecast");
    expect(url.hostname).toBe("custom.example.com");
  });
});

// ---------------------------------------------------------------------------
// validateUpstreamHost
// ---------------------------------------------------------------------------

describe("validateUpstreamHost", () => {
  it("accepts api.open-meteo.com", () => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    expect(validateUpstreamHost(url, WEATHER_ALLOWED_HOSTS)).toBe(true);
  });

  it("rejects evil.com", () => {
    const url = new URL("https://evil.com/v1/forecast");
    expect(validateUpstreamHost(url, WEATHER_ALLOWED_HOSTS)).toBe(false);
  });

  it("rejects subdomain confusion: api.open-meteo.com.evil.com", () => {
    const url = new URL("https://api.open-meteo.com.evil.com/v1/forecast");
    expect(validateUpstreamHost(url, WEATHER_ALLOWED_HOSTS)).toBe(false);
  });

  it("rejects open-meteo.com (missing api. prefix)", () => {
    const url = new URL("https://open-meteo.com/v1/forecast");
    expect(validateUpstreamHost(url, WEATHER_ALLOWED_HOSTS)).toBe(false);
  });

  it("rejects a custom allowlist not containing the host", () => {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    const restrictive = new Set(["other.host.com"]);
    expect(validateUpstreamHost(url, restrictive)).toBe(false);
  });

  it("accepts a custom allowlist that contains the host", () => {
    const url = new URL("https://allowed.example.com/data");
    const allowlist = new Set(["allowed.example.com"]);
    expect(validateUpstreamHost(url, allowlist)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchWeather (mocked fetch)
// ---------------------------------------------------------------------------

const validWeatherPayload = {
  latitude: 35.6727,
  longitude: 139.8175,
  timezone: "Asia/Tokyo",
  hourly: {
    time: ["2026-08-01T00:00"],
    temperature_2m: [30.5],
    precipitation_probability: [20],
  },
  daily: {
    time: ["2026-08-01"],
    temperature_2m_max: [35.0],
    temperature_2m_min: [25.0],
    precipitation_probability_max: [30],
    weathercode: [1],
  },
};

describe("fetchWeather", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it("returns parsed weather data on success", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => validWeatherPayload,
    });

    const result = await fetchWeather(KOTO_CENTER, {
      fetch: mockFetch,
      signal: AbortSignal.timeout(5000),
    });

    expect(result.latitude).toBeCloseTo(35.6727);
    expect(result.timezone).toBe("Asia/Tokyo");
    expect(result.hourly?.temperature_2m[0]).toBe(30.5);
  });

  it("throws when upstream returns non-OK status", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    await expect(
      fetchWeather(KOTO_CENTER, { fetch: mockFetch, signal: AbortSignal.timeout(5000) }),
    ).rejects.toThrow("Upstream returned HTTP 503");
  });

  it("throws when Zod validation fails", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: 35.6727,
        longitude: 139.8175,
        timezone: "Asia/Tokyo",
        hourly: {
          time: ["2026-08-01T00:00"],
          temperature_2m: [99999], // exceeds max(50)
        },
      }),
    });

    await expect(
      fetchWeather(KOTO_CENTER, { fetch: mockFetch, signal: AbortSignal.timeout(5000) }),
    ).rejects.toThrow("Zod validation");
  });

  it("calls fetch with correct headers (no XFF/Cookie/Auth)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => validWeatherPayload,
    });

    await fetchWeather(KOTO_CENTER, {
      fetch: mockFetch,
      signal: AbortSignal.timeout(5000),
    });

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers as Headers;
    expect(headers.get("User-Agent")).toBe("koto-city/1.0 (+/about)");
    expect(headers.get("Accept")).toBe("application/json");
    expect(headers.get("X-Forwarded-For")).toBeNull();
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
  });

  it("uses redirect: manual to prevent SSRF via redirect", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => validWeatherPayload,
    });

    await fetchWeather(KOTO_CENTER, {
      fetch: mockFetch,
      signal: AbortSignal.timeout(5000),
    });

    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].redirect).toBe("manual");
  });
});
