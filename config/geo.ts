// Center coordinates of Koto City (江東区), Tokyo
export const KOTO_CENTER = {
  lat: 35.6727,
  lng: 139.8175,
} as const;

export const TIMEZONE = "Asia/Tokyo";

// Approximate bbox covering Koto-ku. Used to decide whether to fall back to
// the dynamic Overpass-backed POI source: inside this box we prefer the
// bundled official Koto open-data CSV.
export const KOTO_BBOX = {
  south: 35.625,
  west: 139.770,
  north: 35.700,
  east: 139.870,
} as const;

// Approximate bbox covering Tokyo 23 special wards (Tama and the islands
// are intentionally excluded). The dynamic POI proxy only accepts requests
// whose bbox is fully inside this envelope so the Overpass surface stays
// bounded and predictable.
export const TOKYO_23_BBOX = {
  south: 35.500,
  west: 139.560,
  north: 35.900,
  east: 139.920,
} as const;

export type Bbox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

// Edges are inclusive so a point on the southern boundary counts as "inside".
export function isInsideBbox(
  point: { lat: number; lng: number },
  bbox: Bbox,
): boolean {
  return (
    point.lat >= bbox.south &&
    point.lat <= bbox.north &&
    point.lng >= bbox.west &&
    point.lng <= bbox.east
  );
}

export function isBboxInside(inner: Bbox, outer: Bbox): boolean {
  return (
    inner.south >= outer.south &&
    inner.north <= outer.north &&
    inner.west >= outer.west &&
    inner.east <= outer.east
  );
}

export function bboxAreaSqDeg(b: Bbox): number {
  return Math.max(0, b.north - b.south) * Math.max(0, b.east - b.west);
}

// Snap bbox edges to a grid so callers requesting roughly the same view
// share KV cache entries. Default precision is 0.01 degrees ≈ 1.1 km in
// latitude — coarse enough for cache locality, fine enough that adjacent
// pans recompute. South/west floor and north/east ceil so the snapped box
// always SUPERSETS the original (never collapses to zero area, which would
// happen with a naive Math.round when both edges share a step bucket — the
// classic failure mode at zoom 14+ where the viewport spans < step).
export function snapBbox(b: Bbox, step = 0.01): Bbox {
  return {
    south: Math.floor(b.south / step) * step,
    west: Math.floor(b.west / step) * step,
    north: Math.ceil(b.north / step) * step,
    east: Math.ceil(b.east / step) * step,
  };
}
