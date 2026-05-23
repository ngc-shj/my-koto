// Map tile configuration — GSI raster (淡色地図) served by 国土地理院.
// Terms: https://maps.gsi.go.jp/development/ichiran.html
// Notes:
// - The 標準地図 ("std") layer is too colorful to overlay 14 marker
//   layers + 68 colored bus polylines without losing contrast; 淡色地図
//   ("pale") keeps the road/water structure and labels but desaturates
//   so the overlay reads as figure on a quiet ground.
// - We start with raster tiles for reliability; the vector pmtiles flavor of
//   `optimal_bvmap-v1` requires the pmtiles protocol library. Switch back to
//   vector once that integration is in place.
// - OSM raster intentionally excluded per
//   https://operations.osmfoundation.org/policies/tiles/.
export const MAP_TILE = {
  url: "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
  attribution: "地理院タイル (国土地理院 淡色地図)",
  attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html",
  type: "raster",
  // GSI pale raster tile size.
  tileSize: 256,
  // GSI pale raster tiles are available z 5..18.
  maxNativeZoom: 18,
  minNativeZoom: 5,
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
