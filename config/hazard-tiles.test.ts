import { describe, it, expect } from "vitest";
import {
  HAZARD_OVERLAYS,
  getHazardOverlay,
  type HazardOverlayId,
} from "./hazard-tiles";

describe("HAZARD_OVERLAYS", () => {
  it("gives every overlay a unique id", () => {
    const ids = HAZARD_OVERLAYS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("points MLIT overlays at the disaportaldata raster host (CSP allowlist)", () => {
    for (const o of HAZARD_OVERLAYS.filter((o) => o.group === "mlit")) {
      expect(o.urlTemplate).not.toBeNull();
      expect(o.urlTemplate).toContain("https://disaportaldata.gsi.go.jp/raster/");
      expect(o.urlTemplate).toContain("{z}/{x}/{y}.png");
      // MLIT overlays are static — no runtime element resolution.
      expect(o.element).toBeUndefined();
    }
  });

  it("leaves キキクル overlays without a static template (resolved at runtime)", () => {
    for (const o of HAZARD_OVERLAYS.filter((o) => o.group === "kikikuru")) {
      expect(o.urlTemplate).toBeNull();
      expect(o.element).toBeDefined();
    }
  });

  it("keeps raster-opacity within a legible range", () => {
    for (const o of HAZARD_OVERLAYS) {
      expect(o.opacity).toBeGreaterThan(0);
      expect(o.opacity).toBeLessThanOrEqual(1);
    }
  });
});

describe("getHazardOverlay", () => {
  it("resolves a known id", () => {
    expect(getHazardOverlay("mlit_flood").group).toBe("mlit");
  });

  it("throws on an unknown id", () => {
    expect(() => getHazardOverlay("nope" as HazardOverlayId)).toThrow();
  });
});
