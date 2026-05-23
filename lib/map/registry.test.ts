import { describe, expect, it } from "vitest";
import {
  LAYERS,
  LAYER_IDS,
  classifyOsmTags,
  getLayer,
  isLayerBundled,
  isLayerId,
} from "./registry";

describe("layer registry", () => {
  it("has unique layer ids", () => {
    const ids = LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the legacy AED + toilet layers", () => {
    expect(LAYER_IDS).toEqual(expect.arrayContaining(["aed", "toilet"]));
  });

  it("includes the Phase 1 disaster layers", () => {
    expect(LAYER_IDS).toEqual(
      expect.arrayContaining(["shelter", "assembly_point", "water_supply"]),
    );
  });

  it("getLayer throws on unknown id", () => {
    // Casting through unknown so the test exercises the runtime guard.
    expect(() => getLayer("nope" as unknown as Parameters<typeof getLayer>[0])).toThrow();
  });

  it("isLayerId is true for every registered id", () => {
    for (const id of LAYER_IDS) {
      expect(isLayerId(id)).toBe(true);
    }
  });

  it("isLayerId is false for unrelated strings", () => {
    expect(isLayerId("nope")).toBe(false);
    expect(isLayerId("")).toBe(false);
  });

  it("includes the transit layers (station / station_exit)", () => {
    expect(LAYER_IDS).toEqual(
      expect.arrayContaining(["station", "station_exit"]),
    );
  });

  it("does not include bus_stop — bus features moved to /bus", () => {
    expect(LAYER_IDS).not.toContain("bus_stop");
  });

  it("includes the medical layers (hospital / clinic / pharmacy)", () => {
    expect(LAYER_IDS).toEqual(
      expect.arrayContaining(["hospital", "clinic", "pharmacy"]),
    );
  });

  it("marks bundled layers true and OSM-only layers false", () => {
    expect(isLayerBundled("aed")).toBe(true);
    expect(isLayerBundled("shelter")).toBe(true);
    expect(isLayerBundled("station")).toBe(false);
    expect(isLayerBundled("station_exit")).toBe(false);
    expect(isLayerBundled("hospital")).toBe(false);
    expect(isLayerBundled("clinic")).toBe(false);
    expect(isLayerBundled("pharmacy")).toBe(false);
  });
});

describe("classifyOsmTags", () => {
  it("classifies a defibrillator node as aed", () => {
    expect(classifyOsmTags({ emergency: "defibrillator" })).toBe("aed");
  });

  it("falls back to legacy healthcare tag for AED", () => {
    expect(classifyOsmTags({ healthcare: "defibrillator" })).toBe("aed");
  });

  it("classifies amenity=toilets as toilet", () => {
    expect(classifyOsmTags({ amenity: "toilets" })).toBe("toilet");
  });

  it("classifies amenity=shelter as shelter", () => {
    expect(classifyOsmTags({ amenity: "shelter" })).toBe("shelter");
  });

  it("classifies emergency=assembly_point as assembly_point", () => {
    expect(classifyOsmTags({ emergency: "assembly_point" })).toBe(
      "assembly_point",
    );
  });

  it("classifies emergency=drinking_water as water_supply", () => {
    expect(classifyOsmTags({ emergency: "drinking_water" })).toBe(
      "water_supply",
    );
  });

  it("returns null when no tag matches", () => {
    expect(classifyOsmTags({ amenity: "cafe" })).toBeNull();
    expect(classifyOsmTags(undefined)).toBeNull();
  });
});
