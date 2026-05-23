import { describe, it, expect } from "vitest";
import { clusterByPixelBucket } from "./cluster";

// Linear projector for tests: lat/lng map to fixed pixel coordinates.
const identity = (p: { lat: number; lng: number }) => ({ x: p.lng, y: p.lat });

describe("clusterByPixelBucket", () => {
  it("returns one singleton cluster per well-separated point", () => {
    const points = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 100, lng: 100 },
      { id: "c", lat: 200, lng: 200 },
    ];
    const clusters = clusterByPixelBucket(points, identity, 36);
    expect(clusters).toHaveLength(3);
    for (const c of clusters) expect(c.points).toHaveLength(1);
  });

  it("groups points that fall in the same pixel bucket", () => {
    const points = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 5, lng: 5 },
      { id: "c", lat: 10, lng: 10 },
    ];
    const clusters = clusterByPixelBucket(points, identity, 36);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.points).toHaveLength(3);
  });

  it("computes the lng/lat centroid for the cluster", () => {
    const points = [
      { id: "a", lat: 0, lng: 0 },
      { id: "b", lat: 10, lng: 20 },
    ];
    const [cluster] = clusterByPixelBucket(points, identity, 36);
    expect(cluster?.center.lat).toBeCloseTo(5);
    expect(cluster?.center.lng).toBeCloseTo(10);
  });

  it("returns an empty array for empty input", () => {
    expect(clusterByPixelBucket([], identity, 36)).toEqual([]);
  });

  it("rejects non-positive bucket sizes", () => {
    expect(() => clusterByPixelBucket([], identity, 0)).toThrow();
    expect(() => clusterByPixelBucket([], identity, -1)).toThrow();
  });
});
