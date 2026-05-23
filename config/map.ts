// Map tile configuration — GSI raster served by 国土地理院.
// Terms: https://maps.gsi.go.jp/development/ichiran.html
// Notes:
// - 14 marker layers + 68 colored bus polylines on top of the colorful
//   "std" map made it hard to read; we default to 淡色地図 ("pale") so
//   the overlay reads as figure on a quiet ground. The user can swap
//   styles at runtime — see TILE_STYLES below.
// - OSM raster intentionally excluded per
//   https://operations.osmfoundation.org/policies/tiles/.

export type TileStyleId = "pale" | "std" | "blank";

export type TileStyle = {
  readonly id: TileStyleId;
  readonly label: string;
  readonly url: string;
  readonly attribution: string;
  readonly tileSize: number;
  readonly maxNativeZoom: number;
  readonly minNativeZoom: number;
};

export const TILE_STYLES: Readonly<Record<TileStyleId, TileStyle>> = {
  pale: {
    id: "pale",
    label: "淡色地図",
    url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
    attribution: "地理院タイル (国土地理院 淡色地図)",
    tileSize: 256,
    maxNativeZoom: 18,
    minNativeZoom: 5,
  },
  std: {
    id: "std",
    label: "標準地図",
    url: "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
    attribution: "地理院タイル (国土地理院 標準地図)",
    tileSize: 256,
    maxNativeZoom: 18,
    minNativeZoom: 2,
  },
  blank: {
    id: "blank",
    label: "白地図",
    url: "https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png",
    attribution: "地理院タイル (国土地理院 白地図)",
    tileSize: 256,
    maxNativeZoom: 14,
    minNativeZoom: 5,
  },
};

export const DEFAULT_TILE_STYLE: TileStyleId = "pale";

// Backwards-compatible export: the default (pale) tile config. Existing
// imports of MAP_TILE keep working without touching every call site.
export const MAP_TILE = {
  ...TILE_STYLES[DEFAULT_TILE_STYLE],
  attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html",
  type: "raster",
} as const;

// Initial map view centered on Koto City (江東区).
// Allow wider zoom range so the user can both zoom out for orientation and
// zoom in to street level.
export const MAP_INITIAL = {
  center: [139.8175, 35.6727] as [number, number],
  zoom: 13,
  maxZoom: 18,
  minZoom: 9,
} as const;
