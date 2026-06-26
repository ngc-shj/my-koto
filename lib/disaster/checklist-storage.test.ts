import { describe, expect, it, beforeEach } from "vitest";
import { loadCheckedItems, saveCheckedItems } from "./checklist-storage";

beforeEach(() => {
  window.localStorage.removeItem("disaster_checklist_v1");
});

describe("loadCheckedItems / saveCheckedItems", () => {
  it("returns an empty set on a fresh device", () => {
    expect(loadCheckedItems().size).toBe(0);
  });

  it("round-trips a set of ids", () => {
    saveCheckedItems(new Set(["water", "food", "radio"]));
    const loaded = loadCheckedItems();
    expect([...loaded].sort()).toEqual(["food", "radio", "water"]);
  });

  it("persists an empty set (reset clears prior ticks)", () => {
    saveCheckedItems(new Set(["water"]));
    saveCheckedItems(new Set());
    expect(loadCheckedItems().size).toBe(0);
  });

  it("ignores a corrupt (non-array) stored value", () => {
    window.localStorage.setItem("disaster_checklist_v1", '{"water":true}');
    expect(loadCheckedItems().size).toBe(0);
  });

  it("drops non-string entries from a stored array", () => {
    window.localStorage.setItem(
      "disaster_checklist_v1",
      JSON.stringify(["water", 42, null, "food"]),
    );
    expect([...loadCheckedItems()].sort()).toEqual(["food", "water"]);
  });
});
