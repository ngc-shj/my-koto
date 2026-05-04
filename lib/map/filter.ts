import type { MapPoint, MapFilters } from "./types";
import { haversineDistance } from "@/lib/distance";

type FilterContext = {
  // Optional reference point for radius filtering (e.g. user's current
  // location). When omitted, the radius filter is a no-op so the rest of
  // the pipeline still works for the unauthorised-geolocation case.
  referencePoint?: { lat: number; lng: number } | null;
};

// Pure function: returns filtered subset of points based on active filters.
export function filterPoints(
  points: MapPoint[],
  filters: MapFilters,
  context: FilterContext = {},
): MapPoint[] {
  const ref = context.referencePoint ?? null;
  return points.filter((point) => {
    if (point.type === "aed" && !filters.aed) return false;
    if (point.type === "toilet" && !filters.toilet) return false;

    if (filters.barrierFreeOnly && !point.accessibility?.barrier_free) return false;
    if (filters.twentyFourOnly && !point.accessibility?.twenty_four_hour) return false;

    if (filters.radius !== null && ref !== null) {
      if (haversineDistance(ref, point) > filters.radius) return false;
    }

    return true;
  });
}

// Returns up to `limit` points sorted by ascending distance from `from`.
// Each result is annotated with its haversine distance in meters so the UI
// does not need to recompute it for the list view.
export function nearestPoints(
  points: MapPoint[],
  from: { lat: number; lng: number },
  limit = 10,
): Array<MapPoint & { distance: number }> {
  return points
    .map((p) => ({ ...p, distance: haversineDistance(from, p) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
