import { KOTO_CENTER } from "@/config/geo";
import type { AedRecord } from "./schemas/aed";
import type { ToiletRecord } from "./schemas/toilet";
import type { WbgtReading } from "./schemas/wbgt";
import type { WeatherResponse } from "./schemas/weather";

// Koto City bounding box (approximate).
const KOTO_BOUNDS = {
  latMin: 35.62,
  latMax: 35.73,
  lngMin: 139.78,
  lngMax: 139.87,
} as const;

function isInKotoBounds(lat: number, lng: number): boolean {
  return (
    lat >= KOTO_BOUNDS.latMin &&
    lat <= KOTO_BOUNDS.latMax &&
    lng >= KOTO_BOUNDS.lngMin &&
    lng <= KOTO_BOUNDS.lngMax
  );
}

function parseCoord(value: string): number | null {
  const n = parseFloat(value);
  return isNaN(n) ? null : n;
}

export type NormalizedAed = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  locationDetail?: string;
  availableHours?: string;
  phone?: string;
  notes?: string;
};

// Normalizes an AED record, returning null if coordinates are out of range.
export function normalizeAed(record: AedRecord): NormalizedAed | null {
  const lat = parseCoord(record.緯度);
  const lng = parseCoord(record.経度);

  if (lat === null || lng === null) {
    console.warn("[normalize] AED skipped: invalid coords", record.名称);
    return null;
  }

  if (!isInKotoBounds(lat, lng)) {
    console.warn("[normalize] AED skipped: coords outside Koto bounds", record.名称, lat, lng);
    return null;
  }

  return {
    name: record.名称,
    address: record.住所,
    lat,
    lng,
    locationDetail: record.設置場所詳細,
    availableHours: record.利用可能時間,
    phone: record.電話番号,
    notes: record.備考,
  };
}

export type NormalizedToilet = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  accessible: boolean;
  open24h: boolean;
  hasMen: boolean;
  hasWomen: boolean;
  hasMultipurpose: boolean;
  notes?: string;
};

function isTruthy(value: string | undefined): boolean {
  return value === "有" || value === "○" || value === "1" || value === "true" || value === "あり";
}

// Normalizes a toilet record, returning null if coordinates are out of range.
export function normalizeToilet(record: ToiletRecord): NormalizedToilet | null {
  const lat = parseCoord(record.緯度);
  const lng = parseCoord(record.経度);

  if (lat === null || lng === null) {
    console.warn("[normalize] Toilet skipped: invalid coords", record.名称);
    return null;
  }

  if (!isInKotoBounds(lat, lng)) {
    console.warn("[normalize] Toilet skipped: coords outside Koto bounds", record.名称, lat, lng);
    return null;
  }

  return {
    name: record.名称,
    address: record.住所,
    lat,
    lng,
    accessible: isTruthy(record.バリアフリー),
    open24h: isTruthy(record.二十四時間),
    hasMen: isTruthy(record.男性用),
    hasWomen: isTruthy(record.女性用),
    hasMultipurpose: isTruthy(record.多目的),
    notes: record.備考,
  };
}

// Validates WBGT reading range (0–50).
// Returns null and emits a warning if value is out of range.
export function normalizeWbgtReading(reading: WbgtReading): WbgtReading | null {
  if (reading.wbgt < 0 || reading.wbgt > 50) {
    console.warn("[normalize] WBGT skipped: out of range", reading.station, reading.wbgt);
    return null;
  }
  return reading;
}

// Validates weather temperature values (-50–50).
// Returns null and emits a warning for any out-of-range hourly/daily value.
export function normalizeWeather(response: WeatherResponse): WeatherResponse | null {
  const center = KOTO_CENTER;

  // Validate that the response coordinates are close to Koto City.
  const latDiff = Math.abs(response.latitude - center.lat);
  const lngDiff = Math.abs(response.longitude - center.lng);
  if (latDiff > 1 || lngDiff > 1) {
    console.warn("[normalize] Weather skipped: unexpected coordinates", response.latitude, response.longitude);
    return null;
  }

  // Validate hourly temperatures.
  if (response.hourly) {
    for (const temp of response.hourly.temperature_2m) {
      if (temp < -50 || temp > 50) {
        console.warn("[normalize] Weather skipped: hourly temp out of range", temp);
        return null;
      }
    }
  }

  // Validate daily temperatures.
  if (response.daily) {
    for (const temp of [
      ...response.daily.temperature_2m_max,
      ...response.daily.temperature_2m_min,
    ]) {
      if (temp < -50 || temp > 50) {
        console.warn("[normalize] Weather skipped: daily temp out of range", temp);
        return null;
      }
    }
  }

  return response;
}
