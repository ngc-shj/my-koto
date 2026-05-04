// Open-Meteo client: pure functions for URL construction, host validation, and fetching.
import { KOTO_CENTER } from "@/config/geo";
import { UPSTREAM_HOSTS } from "@/config/proxy-allowlist";
import {
  WeatherResponseSchema,
  type WeatherResponse,
} from "@/lib/opendata/schemas/weather";

export type LatLng = { lat: number; lng: number };

export const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

// Allowed upstream hostnames (strict set).
export const WEATHER_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  UPSTREAM_HOSTS.weather,
]);

// Build the Open-Meteo forecast URL for the given coordinates.
export function buildWeatherUrl(
  coord: LatLng,
  base = OPEN_METEO_BASE,
): URL {
  const url = new URL(base);
  url.searchParams.set("latitude", String(coord.lat));
  url.searchParams.set("longitude", String(coord.lng));
  url.searchParams.set(
    "hourly",
    "temperature_2m,precipitation_probability",
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode",
  );
  url.searchParams.set("timezone", "Asia/Tokyo");
  return url;
}

// Validate that the upstream URL hostname is in the allowlist (strict equality).
export function validateUpstreamHost(
  url: URL,
  allowlist: ReadonlySet<string>,
): boolean {
  return allowlist.has(url.hostname);
}

type FetchDeps = {
  fetch: typeof fetch;
  signal: AbortSignal;
};

// Fetch weather data from Open-Meteo, validate with Zod.
export async function fetchWeather(
  coord: LatLng,
  deps: FetchDeps,
): Promise<WeatherResponse> {
  const url = buildWeatherUrl(coord);

  if (!validateUpstreamHost(url, WEATHER_ALLOWED_HOSTS)) {
    throw new Error(`Disallowed upstream host: ${url.hostname}`);
  }

  const headers = new Headers();
  headers.set("User-Agent", "koto-city/1.0 (+/about)");
  headers.set("Accept", "application/json");

  const response = await deps.fetch(url.toString(), {
    headers,
    redirect: "manual",
    signal: deps.signal,
  });

  if (!response.ok) {
    throw new Error(`Upstream returned HTTP ${response.status}`);
  }

  const json: unknown = await response.json();
  const parsed = WeatherResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Upstream response failed Zod validation: ${parsed.error.message}`);
  }

  return parsed.data;
}

// Re-export KOTO_CENTER for convenience in the route handler.
export { KOTO_CENTER };
