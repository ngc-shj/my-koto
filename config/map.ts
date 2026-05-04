// Map tile configuration — GSI vector tiles (CC-BY 4.0, attribution required)
// License: https://maps.gsi.go.jp/development/ichiran.html
// OSM raster tiles intentionally excluded: https://operations.osmfoundation.org/policies/tiles/
export const MAP_TILE = {
  url: "https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf",
  attribution: "地理院タイル (国土地理院)",
  attributionUrl: "https://maps.gsi.go.jp/development/ichiran.html",
  type: "vector",
} as const;

// Initial map view centered on Koto City (江東区)
export const MAP_INITIAL = {
  center: [139.8175, 35.6727] as [number, number],
  zoom: 12,
  maxZoom: 17,
  minZoom: 10,
} as const;
