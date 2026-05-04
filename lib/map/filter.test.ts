import { describe, it, expect } from "vitest";
import { filterPoints, nearestPoints } from "./filter";
import type { MapPoint, MapFilters } from "./types";

const aedPoint: MapPoint = {
  id: "aed-0",
  type: "aed",
  name: "テストAED",
  address: "東京都江東区東陽4-1",
  lat: 35.675,
  lng: 139.817,
};

const toiletBarrierFree24h: MapPoint = {
  id: "toilet-0",
  type: "toilet",
  name: "バリアフリートイレ(24h)",
  address: "東京都江東区亀戸1-1",
  lat: 35.699,
  lng: 139.834,
  accessibility: { barrier_free: true, twenty_four_hour: true },
};

const toiletNoAccess: MapPoint = {
  id: "toilet-1",
  type: "toilet",
  name: "通常トイレ",
  address: "東京都江東区木場4-1",
  lat: 35.673,
  lng: 139.810,
  accessibility: { barrier_free: false, twenty_four_hour: false },
};

const allPoints = [aedPoint, toiletBarrierFree24h, toiletNoAccess];

const defaultFilters: MapFilters = {
  aed: true,
  toilet: true,
  barrierFreeOnly: false,
  twentyFourOnly: false,
  radius: null,
};

describe("filterPoints", () => {
  it("returns all points when all filters are enabled", () => {
    expect(filterPoints(allPoints, defaultFilters)).toHaveLength(3);
  });

  it("hides AED points when aed filter is off", () => {
    const result = filterPoints(allPoints, { ...defaultFilters, aed: false });
    expect(result.every((p) => p.type !== "aed")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("hides toilet points when toilet filter is off", () => {
    const result = filterPoints(allPoints, { ...defaultFilters, toilet: false });
    expect(result.every((p) => p.type !== "toilet")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("shows only barrier-free toilets when barrierFreeOnly is true", () => {
    const result = filterPoints(allPoints, { ...defaultFilters, barrierFreeOnly: true });
    // AED has no accessibility — excluded; only toiletBarrierFree24h passes
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("toilet-0");
  });

  it("shows only 24h toilets when twentyFourOnly is true", () => {
    const result = filterPoints(allPoints, { ...defaultFilters, twentyFourOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("toilet-0");
  });

  it("returns empty array when both type filters are off", () => {
    const result = filterPoints(allPoints, { ...defaultFilters, aed: false, toilet: false });
    expect(result).toHaveLength(0);
  });

  it("does not mutate the original array", () => {
    const copy = [...allPoints];
    filterPoints(allPoints, { ...defaultFilters, aed: false });
    expect(allPoints).toEqual(copy);
  });

  it("filters by radius when reference point is given", () => {
    const ref = { lat: 35.675, lng: 139.817 }; // ≈ aedPoint
    // 500m radius — only aedPoint and toiletNoAccess (≈770m & 940m far in this fixture)
    const within500 = filterPoints(allPoints, { ...defaultFilters, radius: 500 }, { referencePoint: ref });
    expect(within500.map((p) => p.id)).toContain("aed-0");
    // toiletBarrierFree24h is ~3km north-east, must be filtered out at any tight radius.
    expect(within500.map((p) => p.id)).not.toContain("toilet-0");
  });

  it("ignores radius when reference point is missing", () => {
    const result = filterPoints(allPoints, { ...defaultFilters, radius: 500 });
    expect(result).toHaveLength(3);
  });
});

describe("nearestPoints", () => {
  it("returns points sorted by distance, capped to limit", () => {
    const ref = { lat: 35.675, lng: 139.817 };
    const result = nearestPoints(allPoints, ref, 2);
    expect(result).toHaveLength(2);
    // Distances must be ascending.
    expect(result[0].distance).toBeLessThanOrEqual(result[1].distance);
    // Distance is annotated as a positive number.
    for (const p of result) {
      expect(p.distance).toBeGreaterThanOrEqual(0);
    }
  });
});
