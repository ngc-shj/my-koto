import { describe, it, expect } from "vitest";
import {
  OVERPASS_HOST,
  OVERPASS_URL,
  OverpassResponseSchema,
  buildOverpassQuery,
  elementsToMapPoints,
} from "./overpass";

describe("OVERPASS_URL", () => {
  it("targets the allowlisted host", () => {
    expect(new URL(OVERPASS_URL).hostname).toBe(OVERPASS_HOST);
  });
});

describe("buildOverpassQuery", () => {
  const bbox = { south: 35.65, west: 139.69, north: 35.69, east: 139.74 };

  it("composes a query that covers both AED tag variants", () => {
    const q = buildOverpassQuery(bbox, ["aed"]);
    expect(q).toContain('node["emergency"="defibrillator"]');
    expect(q).toContain('node["healthcare"="defibrillator"]');
    expect(q).toContain("(35.65,139.69,35.69,139.74)");
    expect(q).toMatch(/^\[out:json\]\[timeout:\d+\];/);
    expect(q).toMatch(/\);out tags center;$/);
  });

  it("composes a query for toilets only", () => {
    const q = buildOverpassQuery(bbox, ["toilet"]);
    expect(q).toContain('node["amenity"="toilets"]');
    expect(q).not.toContain("emergency");
  });

  it("composes a query for both types together", () => {
    const q = buildOverpassQuery(bbox, ["aed", "toilet"]);
    expect(q).toContain('node["emergency"="defibrillator"]');
    expect(q).toContain('node["amenity"="toilets"]');
  });

  it("rejects an empty types list", () => {
    expect(() => buildOverpassQuery(bbox, [])).toThrow();
  });
});

describe("OverpassResponseSchema", () => {
  it("accepts a minimal valid response", () => {
    const parsed = OverpassResponseSchema.parse({
      elements: [
        {
          type: "node",
          id: 12345,
          lat: 35.67,
          lon: 139.81,
          tags: { amenity: "toilets" },
        },
      ],
    });
    expect(parsed.elements).toHaveLength(1);
  });

  it("rejects elements missing coordinates", () => {
    expect(() =>
      OverpassResponseSchema.parse({ elements: [{ type: "node", id: 1 }] }),
    ).toThrow();
  });
});

describe("elementsToMapPoints", () => {
  it("maps emergency=defibrillator nodes to aed points", () => {
    const points = elementsToMapPoints([
      {
        type: "node",
        id: 1,
        lat: 35.67,
        lon: 139.81,
        tags: {
          emergency: "defibrillator",
          "name:ja": "○○ AED",
          "addr:city": "新宿区",
          opening_hours: "24/7",
          wheelchair: "yes",
        },
      },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("aed");
    expect(points[0].source).toBe("osm");
    expect(points[0].name).toBe("○○ AED");
    expect(points[0].address).toBe("新宿区");
    expect(points[0].accessibility?.barrier_free).toBe(true);
    expect(points[0].accessibility?.twenty_four_hour).toBe(true);
  });

  it("maps amenity=toilets nodes to toilet points", () => {
    const points = elementsToMapPoints([
      {
        type: "node",
        id: 2,
        lat: 35.69,
        lon: 139.69,
        tags: { amenity: "toilets", name: "公衆トイレ" },
      },
    ]);
    expect(points).toHaveLength(1);
    expect(points[0].type).toBe("toilet");
    expect(points[0].source).toBe("osm");
  });

  it("falls back to a generic name when no name tags exist", () => {
    const points = elementsToMapPoints([
      { type: "node", id: 3, lat: 35.7, lon: 139.7, tags: { amenity: "toilets" } },
    ]);
    expect(points[0].name).toBe("公衆トイレ");
  });

  it("drops elements that match no known category", () => {
    const points = elementsToMapPoints([
      { type: "node", id: 4, lat: 35.7, lon: 139.7, tags: { amenity: "cafe" } },
      { type: "node", id: 5, lat: 35.7, lon: 139.7 },
    ]);
    expect(points).toHaveLength(0);
  });
});
