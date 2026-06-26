// Hazard overlay raster tiles layered on top of the GSI basemap.
//
// Two families, both served with `Access-Control-Allow-Origin: *`, so the
// browser fetches the tiles directly (no Edge proxy):
//
// - キキクル (JMA risk distribution): real-time rainfall risk. The tile path
//   needs a basetime/validtime/member triple resolved at runtime from
//   targetTimes.json — see lib/jma/kikukuru.ts. `urlTemplate` is null here
//   because the prefix is only known after that resolution.
// - 国土交通省 ハザードマップ (MLIT): static inundation-assumption rasters
//   (洪水/高潮/津波). Fixed URL template, no runtime resolution.
//
// Koto-ku is largely zero-meter ground, so flood/high-tide/tsunami overlays
// are the headline disaster-preparedness value.

export type KikukuruElement = "inund" | "land" | "flood";

export type HazardOverlayId =
  | "kikikuru_inund"
  | "kikikuru_land"
  | "kikikuru_flood"
  | "mlit_flood"
  | "mlit_hightide"
  | "mlit_tsunami";

export type HazardOverlayGroup = "kikikuru" | "mlit";

export type HazardOverlay = {
  readonly id: HazardOverlayId;
  readonly label: string;
  readonly group: HazardOverlayGroup;
  // raster-opacity applied to the MapLibre layer. MLIT rasters are denser so
  // they need more transparency to keep the basemap legible underneath.
  readonly opacity: number;
  readonly attribution: string;
  readonly legendUrl: string;
  // Fixed `{z}/{x}/{y}` template for MLIT. null for キキクル — its prefix
  // (basetime/member/validtime) is resolved at runtime in lib/jma/kikukuru.ts.
  readonly urlTemplate: string | null;
  // Present only for キキクル overlays; selects the risk surface.
  readonly element?: KikukuruElement;
  readonly tileSize: number;
  readonly maxNativeZoom: number;
  readonly minNativeZoom: number;
};

// 国土交通省 ハザードマップポータルサイト「重ねるハザードマップ」raster paths.
// Confirmed reachable (200 / image/png) over Koto-ku tiles.
const MLIT_RASTER_BASE = "https://disaportaldata.gsi.go.jp/raster";
const MLIT_LEGEND_URL = "https://disaportal.gsi.go.jp/hazardmap/copyright/opendata.html";

function mlitTemplate(dataset: string): string {
  return `${MLIT_RASTER_BASE}/${dataset}/{z}/{x}/{y}.png`;
}

const KIKUKURU_LEGEND_URL = "https://www.jma.go.jp/bosai/risk/";

export const HAZARD_OVERLAYS: readonly HazardOverlay[] = [
  // --- キキクル (気象庁 危険度分布) ---
  {
    id: "kikikuru_inund",
    label: "キキクル (浸水害)",
    group: "kikikuru",
    opacity: 0.6,
    attribution: "キキクル (気象庁)",
    legendUrl: KIKUKURU_LEGEND_URL,
    urlTemplate: null,
    element: "inund",
    tileSize: 256,
    maxNativeZoom: 16,
    minNativeZoom: 4,
  },
  {
    id: "kikikuru_flood",
    label: "キキクル (洪水)",
    group: "kikikuru",
    opacity: 0.6,
    attribution: "キキクル (気象庁)",
    legendUrl: KIKUKURU_LEGEND_URL,
    urlTemplate: null,
    element: "flood",
    tileSize: 256,
    maxNativeZoom: 16,
    minNativeZoom: 4,
  },
  {
    id: "kikikuru_land",
    label: "キキクル (土砂災害)",
    group: "kikikuru",
    opacity: 0.6,
    attribution: "キキクル (気象庁)",
    legendUrl: KIKUKURU_LEGEND_URL,
    urlTemplate: null,
    element: "land",
    tileSize: 256,
    maxNativeZoom: 16,
    minNativeZoom: 4,
  },
  // --- 国土交通省 ハザードマップ (浸水想定区域) ---
  {
    id: "mlit_flood",
    label: "洪水浸水想定 (想定最大規模)",
    group: "mlit",
    opacity: 0.55,
    attribution: "ハザードマップ (国土交通省)",
    legendUrl: MLIT_LEGEND_URL,
    urlTemplate: mlitTemplate("01_flood_l2_shinsuishin_data"),
    tileSize: 256,
    maxNativeZoom: 17,
    minNativeZoom: 2,
  },
  {
    id: "mlit_hightide",
    label: "高潮浸水想定",
    group: "mlit",
    opacity: 0.55,
    attribution: "ハザードマップ (国土交通省)",
    legendUrl: MLIT_LEGEND_URL,
    urlTemplate: mlitTemplate("03_hightide_l2_shinsuishin_data"),
    tileSize: 256,
    maxNativeZoom: 17,
    minNativeZoom: 2,
  },
  {
    id: "mlit_tsunami",
    label: "津波浸水想定",
    group: "mlit",
    opacity: 0.55,
    attribution: "ハザードマップ (国土交通省)",
    legendUrl: MLIT_LEGEND_URL,
    urlTemplate: mlitTemplate("04_tsunami_newlegend_data"),
    tileSize: 256,
    maxNativeZoom: 17,
    minNativeZoom: 2,
  },
];

export function getHazardOverlay(id: HazardOverlayId): HazardOverlay {
  const found = HAZARD_OVERLAYS.find((o) => o.id === id);
  if (found == null) {
    throw new Error(`Unknown hazard overlay id: ${id}`);
  }
  return found;
}

export const HAZARD_OVERLAY_GROUPS: Readonly<
  Record<HazardOverlayGroup, { readonly label: string; readonly legendUrl: string }>
> = {
  kikikuru: { label: "キキクル (危険度分布)", legendUrl: KIKUKURU_LEGEND_URL },
  mlit: { label: "ハザードマップ (浸水想定)", legendUrl: MLIT_LEGEND_URL },
};
