// Pure helpers that turn the bundled Toei bus catalog into a GeoJSON
// FeatureCollection of LineStrings the map can render as colored
// "subway-map" style polylines. Stops within a direction are connected
// in stopSequence order, and each route gets a deterministic HSL color
// so the same line keeps the same hue across renders.

import type { BusToeiData } from "@/lib/opendata/schemas/bus";

export type BusRouteLineFeature = {
  readonly type: "Feature";
  readonly geometry: {
    readonly type: "LineString";
    readonly coordinates: readonly (readonly [number, number])[];
  };
  readonly properties: {
    readonly routeId: string;
    readonly directionId: "0" | "1";
    readonly shortName: string;
    readonly headsign: string;
    readonly color: string;
  };
};

export type BusRouteLines = {
  readonly type: "FeatureCollection";
  readonly features: readonly BusRouteLineFeature[];
};

// FNV-1a 32-bit, plenty for ~70 route ids. Stable so the same route
// always paints the same hue across server/client renders.
function hashRouteId(routeId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < routeId.length; i++) {
    h ^= routeId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function routeColor(routeId: string): string {
  const hue = hashRouteId(routeId) % 360;
  return `hsl(${hue} 70% 45%)`;
}

// Compact metadata for the legend UI. One entry per route (regardless of
// direction count). Sorted alphabetically by shortName so the legend
// reads predictably.
export type BusRouteLegendEntry = {
  readonly routeId: string;
  readonly shortName: string;
  readonly color: string;
};

export function buildBusRouteLegend(
  data: BusToeiData,
): readonly BusRouteLegendEntry[] {
  return [...data.routes]
    .map((r) => ({
      routeId: r.routeId,
      shortName: r.shortName,
      color: routeColor(r.routeId),
    }))
    .sort((a, b) => a.shortName.localeCompare(b.shortName, "ja"));
}

// Reverse index: which routes (with direction + headsign) serve a given
// stop id. Used by the /map detail panel so clicking a bus stop pin
// reveals the bus systems passing through it and lets the user pick one
// to highlight.
export type StopRouteServing = {
  readonly routeId: string;
  readonly shortName: string;
  readonly directionId: "0" | "1";
  readonly headsign: string;
  readonly color: string;
};

export type StopRouteIndex = Readonly<Record<string, readonly StopRouteServing[]>>;

export function buildStopRouteIndex(data: BusToeiData): StopRouteIndex {
  const index = new Map<string, StopRouteServing[]>();
  for (const route of data.routes) {
    const color = routeColor(route.routeId);
    for (const dir of route.directions) {
      for (const stopId of dir.stopSequence) {
        const arr = index.get(stopId) ?? [];
        // Skip if the same route+direction was already pushed (a route
        // sometimes lists the same stop twice on a loop).
        const dup = arr.some(
          (e) => e.routeId === route.routeId && e.directionId === dir.directionId,
        );
        if (dup) continue;
        arr.push({
          routeId: route.routeId,
          shortName: route.shortName,
          directionId: dir.directionId,
          headsign: dir.headsign,
          color,
        });
        index.set(stopId, arr);
      }
    }
  }
  const out: Record<string, StopRouteServing[]> = {};
  for (const [k, v] of index) out[k] = v;
  return out;
}

export function buildBusRouteLines(data: BusToeiData): BusRouteLines {
  const features: BusRouteLineFeature[] = [];
  for (const route of data.routes) {
    const color = routeColor(route.routeId);
    for (const dir of route.directions) {
      // GTFS shapes.txt gives a road-following polyline; prefer it when
      // present and only fall back to the stopSequence-connected line
      // when the operator didn't publish a shape for this direction.
      let coords: readonly (readonly [number, number])[] = [];
      if (dir.shape != null && dir.shape.length >= 2) {
        coords = dir.shape;
      } else {
        const stopCoords: [number, number][] = [];
        for (const stopId of dir.stopSequence) {
          const stop = data.stops[stopId];
          if (stop == null) continue;
          stopCoords.push([stop.lng, stop.lat]);
        }
        coords = stopCoords;
      }
      // A LineString needs at least two points to render.
      if (coords.length < 2) continue;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          routeId: route.routeId,
          directionId: dir.directionId,
          shortName: route.shortName,
          headsign: dir.headsign,
          color,
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}
