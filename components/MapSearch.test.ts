import { describe, it, expect } from "vitest";
import { searchMapPoints } from "./MapSearch";
import type { MapPoint } from "@/lib/map/types";

function point(overrides: Partial<MapPoint> = {}): MapPoint {
  return {
    id: "p-1",
    type: "park",
    name: "東陽公園",
    address: "東京都江東区東陽1-2-3",
    lat: 35.67,
    lng: 139.82,
    ...overrides,
  };
}

describe("searchMapPoints", () => {
  it("returns empty for an empty query", () => {
    expect(searchMapPoints([point()], "")).toEqual([]);
    expect(searchMapPoints([point()], "   ")).toEqual([]);
  });

  it("matches on name substring", () => {
    const a = point({ id: "a", name: "東陽公園", address: "" });
    const b = point({ id: "b", name: "亀戸中央公園", address: "" });
    expect(searchMapPoints([a, b], "東陽").map((p) => p.id)).toEqual(["a"]);
  });

  it("matches on address substring", () => {
    const a = point({ id: "a", name: "A 公園", address: "江東区東陽1" });
    const b = point({ id: "b", name: "B 公園", address: "江東区豊洲5" });
    expect(searchMapPoints([a, b], "豊洲").map((p) => p.id)).toEqual(["b"]);
  });

  it("trims surrounding whitespace before matching", () => {
    const a = point({ id: "a", name: "東陽公園" });
    expect(searchMapPoints([a], "  東陽  ")).toHaveLength(1);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      point({ id: `p-${i}`, name: `東陽${i}` }),
    );
    expect(searchMapPoints(many, "東陽", 5)).toHaveLength(5);
  });
});
