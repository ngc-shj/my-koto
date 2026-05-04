import type { MapPoint, MapFilters } from "./types";

// Pure function: returns filtered subset of points based on active filters.
export function filterPoints(points: MapPoint[], filters: MapFilters): MapPoint[] {
  return points.filter((point) => {
    if (point.type === "aed" && !filters.aed) return false;
    if (point.type === "toilet" && !filters.toilet) return false;

    if (filters.barrierFreeOnly && !point.accessibility?.barrier_free) return false;
    if (filters.twentyFourOnly && !point.accessibility?.twenty_four_hour) return false;

    return true;
  });
}
