import { describe, it, expect } from "vitest";
import { buildBusRouteLines, routeColor } from "./bus-routes";
import type { BusToeiData } from "@/lib/opendata/schemas/bus";

function sampleData(): BusToeiData {
  return {
    fetchedAt: "2026-05-23T00:00:00Z",
    feedVersion: "test",
    source: "https://example.com/test.zip",
    license: { name: "CC-BY 4.0", url: "https://example.com/" },
    stops: {
      a: { stopId: "a", name: "A", lat: 35.0, lng: 139.0 },
      b: { stopId: "b", name: "B", lat: 35.1, lng: 139.1 },
      c: { stopId: "c", name: "C", lat: 35.2, lng: 139.2 },
    },
    routes: [
      {
        routeId: "R1",
        shortName: "業10",
        longName: "",
        agencyId: "Toei",
        directions: [
          {
            directionId: "0",
            headsign: "東京",
            stopSequence: ["a", "b", "c"],
            schedule: { weekday: [], saturday: [], sunday: [] },
          },
          {
            directionId: "1",
            headsign: "深川",
            // Two stops is the minimum for a LineString.
            stopSequence: ["c", "a"],
            schedule: { weekday: [], saturday: [], sunday: [] },
          },
        ],
      },
      {
        routeId: "R2",
        shortName: "海01",
        longName: "",
        agencyId: "Toei",
        directions: [
          {
            directionId: "0",
            headsign: "豊洲",
            // Only one stop — should be skipped.
            stopSequence: ["a"],
            schedule: { weekday: [], saturday: [], sunday: [] },
          },
        ],
      },
    ],
  };
}

describe("buildBusRouteLines", () => {
  it("emits one feature per route+direction with at least 2 stops", () => {
    const result = buildBusRouteLines(sampleData());
    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(2);
    expect(
      result.features.map((f) => `${f.properties.routeId}:${f.properties.directionId}`),
    ).toEqual(["R1:0", "R1:1"]);
  });

  it("emits coordinates in [lng, lat] order for MapLibre", () => {
    const result = buildBusRouteLines(sampleData());
    const feature = result.features[0];
    expect(feature?.geometry.coordinates[0]).toEqual([139.0, 35.0]);
    expect(feature?.geometry.coordinates[1]).toEqual([139.1, 35.1]);
  });

  it("attaches the deterministic route color to each feature", () => {
    const result = buildBusRouteLines(sampleData());
    for (const f of result.features) {
      expect(f.properties.color).toBe(routeColor(f.properties.routeId));
    }
  });

  it("skips stops missing from the stops index", () => {
    const data = sampleData();
    // Drop stop "b" from the lookup; the line should still emit but
    // with two points instead of three.
    const stops = { ...data.stops };
    delete (stops as Record<string, unknown>).b;
    const broken: BusToeiData = { ...data, stops };
    const result = buildBusRouteLines(broken);
    const r1Outbound = result.features.find(
      (f) =>
        f.properties.routeId === "R1" && f.properties.directionId === "0",
    );
    expect(r1Outbound?.geometry.coordinates).toHaveLength(2);
  });
});

describe("routeColor", () => {
  it("is stable for the same id", () => {
    expect(routeColor("業10")).toBe(routeColor("業10"));
  });

  it("differs across distinct route ids in the common case", () => {
    expect(routeColor("業10")).not.toBe(routeColor("海01"));
  });
});
