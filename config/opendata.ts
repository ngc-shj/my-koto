// Dataset IDs for Tokyo Open Data Catalog (Koto City organization).
// Confirmed on 2026-05-04. All datasets are CC-BY 4.0.
export const DATASETS = {
  gomi: "t131083d3100000009-671838441b8036aa352b967b5514a545",
  aed: "t131083d0000000027",
  toilet: "t131083d0000000019",
  events: "t131083d0000000017-252a3033bb76c746c8ee30c24a3a2b5a-0",
  // gomi-dictionary: dataset ID to be confirmed on implementation day
} as const;

export const TOKYO_OPEN_DATA_API_BASE = "https://service.api.metro.tokyo.lg.jp";

// WBGT observation point code for Tokyo area (Koto City vicinity).
// Source: Ministry of the Environment Heat Illness Prevention Information Site
// https://www.wbgt.env.go.jp/
// Confirmed observation point: Tokyo (東京) — station code "44132"
export const WBGT_STATION_CODE = "44132";
export const WBGT_BASE_URL = "https://www.wbgt.env.go.jp";

// Open-Meteo base URL (weather forecast)
export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com";
