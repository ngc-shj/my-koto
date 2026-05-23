// Dataset IDs for Tokyo Open Data Catalog (Koto City organization).
// Resolved via CKAN package_show — the older service.api.metro.tokyo.lg.jp
// endpoint was retired in 2026 (now returns Azure 404). All datasets remain
// CC-BY 4.0.
export const DATASETS = {
  gomi: "t131083d3100000009",
  aed: "t131083d0000000027",
  toilet: "t131083d0000000019",
  events: "t131083d0000000017",
} as const;

// CKAN package_show endpoint — used by both fetch-opendata.ts and
// generate-pois.ts to resolve the current resource URL for each dataset
// (Tokyo Met rolls resource filenames per refresh).
export const TOKYO_OPEN_DATA_CKAN_API =
  "https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_show";

// WBGT observation point code for Tokyo area (Koto City vicinity).
// Source: Ministry of the Environment Heat Illness Prevention Information Site
// https://www.wbgt.env.go.jp/
// Confirmed observation point: Tokyo (東京) — station code "44132"
export const WBGT_STATION_CODE = "44132";
export const WBGT_BASE_URL = "https://www.wbgt.env.go.jp";

// Open-Meteo base URL (weather forecast)
export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com";

// Toei Bus GTFS-JP static feed (ODPT public mirror, no auth required).
// CC-BY 4.0. Refreshed by the operator on roughly a quarterly cadence.
export const TOEI_BUS_GTFS_URL =
  "https://api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip";

// JMA disaster prevention info — current warnings/advisories. Tokyo
// prefecture feed (130000) carries every ward and island; the route layer
// pre-filters down to Koto-ku (class20s code 1310800).
export const JMA_WARNING_BASE_URL = "https://www.jma.go.jp";
export const JMA_TOKYO_PREFECTURE_CODE = "130000";
export const JMA_KOTO_AREA_CODE = "1310800";
export function buildJmaWarningUrl(prefectureCode: string): URL {
  return new URL(
    `/bosai/warning/data/warning/${encodeURIComponent(prefectureCode)}.json`,
    JMA_WARNING_BASE_URL,
  );
}

// JMA quake list — latest ~200 felt events nationwide. The list is one
// JSON file with no path parameter, so the URL is hard-coded.
export const JMA_QUAKE_LIST_URL = `${JMA_WARNING_BASE_URL}/bosai/quake/data/list.json`;
