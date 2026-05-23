import { describe, it, expect } from "vitest";
import { buildBusRouteLegend, buildBusRouteLines, routeColor } from "./bus-routes";
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

  it("uses the GTFS shape when available instead of stop-connected geometry", () => {
    const data = sampleData();
    // Replace R1 dir 0's geometry with a fake road-following shape that
    // does NOT match the stops. The renderer should still pick it.
    const data2: BusToeiData = {
      ...data,
      routes: data.routes.map((r) =>
        r.routeId === "R1"
          ? {
              ...r,
              directions: r.directions.map((d) =>
                d.directionId === "0"
                  ? { ...d, shape: [[140.5, 35.5], [140.6, 35.6], [140.7, 35.7]] }
                  : d,
              ),
            }
          : r,
      ),
    };
    const result = buildBusRouteLines(data2);
    const r1Outbound = result.features.find(
      (f) =>
        f.properties.routeId === "R1" && f.properties.directionId === "0",
    );
    expect(r1Outbound?.geometry.coordinates[0]).toEqual([140.5, 35.5]);
    expect(r1Outbound?.geometry.coordinates).toHaveLength(3);
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

describe("buildBusRouteLegend", () => {
  it("returns one entry per route with matching color", () => {
    const legend = buildBusRouteLegend(sampleData());
    expect(legend).toHaveLength(2);
    for (const entry of legend) {
      expect(entry.color).toBe(routeColor(entry.routeId));
    }
  });

  it("sorts entries by shortName using ja locale", () => {
    const legend = buildBusRouteLegend(sampleData());
    expect(legend.map((e) => e.shortName)).toEqual(["海01", "業10"]);
  });
});
