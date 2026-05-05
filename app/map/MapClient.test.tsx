/**
 * C2.1 regression: two viewport bboxes that snap to the same 0.01° grid cell
 * must produce byte-identical /api/pois URLs.
 *
 * MapClient builds the URL as:
 *   bbox=<south.toFixed(2)>,<west.toFixed(2)>,<north.toFixed(2)>,<east.toFixed(2)>
 *
 * This test verifies the canonicalisation by importing the helpers used in
 * MapClient and re-running the URL-construction logic — decoupled from the
 * MapLibre render so the test runs in jsdom without a canvas.
 */
import { describe, it, expect } from "vitest";
import { snapBbox, type Bbox } from "@/config/geo";

// Replicate the URL-building fragment from MapClient.tsx maybeFetchExternalPois.
function buildPoisUrl(live: Bbox, sortedTypes: readonly string[]): string {
  const snapped = snapBbox(live, 0.01);
  const params = new URLSearchParams({
    bbox: `${snapped.south.toFixed(2)},${snapped.west.toFixed(2)},${snapped.north.toFixed(2)},${snapped.east.toFixed(2)}`,
    types: sortedTypes.join(","),
  });
  return `/api/pois?${params.toString()}`;
}

describe("MapClient POI URL canonicalisation (C2.1)", () => {
  it("two viewports rounding to the same snapped grid produce byte-identical URLs", () => {
    // Two slightly different viewports that both snap to the same 0.01° cell.
    const viewport1: Bbox = {
      south: 35.651,
      west: 139.751,
      north: 35.695,
      east: 139.795,
    };
    const viewport2: Bbox = {
      south: 35.653,  // slightly different, same floor cell
      west: 139.753,
      north: 35.692,
      east: 139.793,
    };

    const types = ["aed", "shelter"] as const;
    const url1 = buildPoisUrl(viewport1, types);
    const url2 = buildPoisUrl(viewport2, types);

    expect(url1).toBe(url2);
  });

  it("different snapped grid cells produce different URLs", () => {
    const viewport1: Bbox = {
      south: 35.651,
      west: 139.751,
      north: 35.695,
      east: 139.795,
    };
    // This viewport's south crosses the 0.01° grid boundary.
    const viewport2: Bbox = {
      south: 35.661,
      west: 139.761,
      north: 35.705,
      east: 139.805,
    };

    const types = ["aed"] as const;
    const url1 = buildPoisUrl(viewport1, types);
    const url2 = buildPoisUrl(viewport2, types);

    expect(url1).not.toBe(url2);
  });

  it("snapped coordinates use exactly 2 decimal places (toFixed(2) precision)", () => {
    const viewport: Bbox = {
      south: 35.654321,
      west: 139.754321,
      north: 35.694321,
      east: 139.794321,
    };

    const url = buildPoisUrl(viewport, ["aed"]);
    const bboxParam = new URLSearchParams(url.split("?")[1]).get("bbox")!;
    const parts = bboxParam.split(",");

    // Each coordinate in the bbox must have at most 2 decimal places.
    for (const part of parts) {
      const decimals = part.includes(".") ? part.split(".")[1].length : 0;
      expect(decimals).toBeLessThanOrEqual(2);
    }
  });
});
