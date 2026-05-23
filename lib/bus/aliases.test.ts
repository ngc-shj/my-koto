import { describe, it, expect } from "vitest";
import { displayRouteName, resolveRouteAlias } from "./aliases";

describe("displayRouteName", () => {
  it("rewrites the full-width 江東０１ code to しおかぜ", () => {
    expect(displayRouteName("江東０１")).toBe("しおかぜ（江東01）");
  });

  it("also handles the half-width 江東01 spelling", () => {
    expect(displayRouteName("江東01")).toBe("しおかぜ（江東01）");
  });

  it("passes through codes that have no alias", () => {
    expect(displayRouteName("業10")).toBe("業10");
    expect(displayRouteName("海０１")).toBe("海０１");
  });
});

describe("resolveRouteAlias", () => {
  it("resolves しおかぜ to the canonical 江東０１ code", () => {
    expect(resolveRouteAlias("しおかぜ")).toBe("江東０１");
  });

  it("returns null when no alias matches", () => {
    expect(resolveRouteAlias("錦糸町")).toBeNull();
    expect(resolveRouteAlias("")).toBeNull();
  });
});
