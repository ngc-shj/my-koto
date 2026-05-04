import { describe, it, expect } from "vitest";
import { resolveSchedule } from "./schedule";
import type { District, SpecialOverlay } from "./types";

// kameido-1: burnable on mon/thu, non_burnable on wed
const districtKameido1: District = {
  id: "kameido-1",
  label: "亀戸 1 丁目",
  addresses: ["亀戸一丁目"],
  schedule: {
    burnable: ["mon", "thu"],
    non_burnable: ["wed"],
    resource_plastic: ["tue"],
    container_plastic: ["fri"],
    pet_bottle: ["fri"],
    bottles_cans: ["fri"],
    bulky: [],
  },
};

// 2026-01-05 is a Monday.
const mondayJan5 = new Date("2026-01-05T00:00:00");
// 2026-01-08 is a Thursday.
const thursdayJan8 = new Date("2026-01-08T00:00:00");
// 2026-01-07 is a Wednesday.
const wednesdayJan7 = new Date("2026-01-07T00:00:00");
// 2025-12-31 is a Wednesday.
const wedDec31 = new Date("2025-12-31T00:00:00");
// 2026-01-01 is a Thursday.
const thuJan1 = new Date("2026-01-01T00:00:00");

describe("resolveSchedule — normal weekly", () => {
  it("returns burnable on Monday", () => {
    const result = resolveSchedule(districtKameido1, [], {
      from: mondayJan5,
      to: mondayJan5,
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toContain("burnable");
  });

  it("returns burnable on Thursday", () => {
    const result = resolveSchedule(districtKameido1, [], {
      from: thursdayJan8,
      to: thursdayJan8,
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toContain("burnable");
  });

  it("returns non_burnable on Wednesday", () => {
    const result = resolveSchedule(districtKameido1, [], {
      from: wednesdayJan7,
      to: wednesdayJan7,
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toContain("non_burnable");
  });

  it("returns empty on Sunday (no scheduled pickup)", () => {
    // 2026-01-04 is a Sunday
    const sunday = new Date("2026-01-04T00:00:00");
    const result = resolveSchedule(districtKameido1, [], {
      from: sunday,
      to: sunday,
    });
    expect(result).toHaveLength(0);
  });

  it("returns multiple days in a range", () => {
    // Mon Jan 5 to Thu Jan 8 → 4 days: Mon (burnable), Tue (resource_plastic), Wed (non_burnable), Thu (burnable)
    const result = resolveSchedule(districtKameido1, [], {
      from: mondayJan5,
      to: thursdayJan8,
    });
    expect(result).toHaveLength(4);
  });
});

describe("resolveSchedule — overlay (New Year's holiday)", () => {
  const newYearOverlay: SpecialOverlay = {
    date: "2026-01-01",
    districts: ["kameido-1"],
    categories: [],
    note: "New Year's Day — no collection",
  };

  it("skips all collection on New Year's Day (categories=[] zeroes the day)", () => {
    const result = resolveSchedule(districtKameido1, [newYearOverlay], {
      from: thuJan1,
      to: thuJan1,
    });
    // Thu Jan 1 would normally have burnable, but overlay cancels it.
    expect(result).toHaveLength(0);
  });

  it("still collects normally on days without an overlay", () => {
    const result = resolveSchedule(districtKameido1, [newYearOverlay], {
      from: mondayJan5,
      to: mondayJan5,
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toContain("burnable");
  });

  it("overlay for another district does not affect kameido-1", () => {
    const otherOverlay: SpecialOverlay = {
      date: "2026-01-05",
      districts: ["toyosu"],
      categories: [],
    };
    const result = resolveSchedule(districtKameido1, [otherOverlay], {
      from: mondayJan5,
      to: mondayJan5,
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toContain("burnable");
  });
});

describe("resolveSchedule — overlay Dec 31 (no collection)", () => {
  const dec31Overlay: SpecialOverlay = {
    date: "2025-12-31",
    districts: ["kameido-1"],
    categories: [],
    note: "New Year's Eve — no collection",
  };

  it("skips non_burnable on Dec 31 (Wednesday) due to overlay", () => {
    const result = resolveSchedule(districtKameido1, [dec31Overlay], {
      from: wedDec31,
      to: wedDec31,
    });
    expect(result).toHaveLength(0);
  });
});

describe("resolveSchedule — overlay with explicit categories (supplementary)", () => {
  it("substitutes the entire day's collection set with the overlay categories", () => {
    // On Wed (normally non_burnable), force a supplementary burnable-only day.
    const supplementaryOverlay: SpecialOverlay = {
      date: "2026-01-07",
      districts: ["kameido-1"],
      categories: ["burnable"],
    };
    const result = resolveSchedule(districtKameido1, [supplementaryOverlay], {
      from: wednesdayJan7,
      to: wednesdayJan7,
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toEqual(["burnable"]);
  });
});
