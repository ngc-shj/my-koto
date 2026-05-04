import { describe, it, expect } from "vitest";
import { resolveSchedule, biweeklyCategories } from "./schedule";
import type { District, SpecialOverlay } from "./types";

// Synthetic test district. The real master uses route-grouped IDs like
// `kameido-1-3` after the Step-9 rebuild; we deliberately keep this
// fixture's id off the master so a future allowlist tightening would
// flag drift instead of letting the test pass under a stale literal.
const districtKameido1: District = {
  id: "test-kameido",
  label: "亀戸 1 丁目 (test)",
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
    districts: ["test-kameido"],
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
    districts: ["test-kameido"],
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

describe("biweekly handling — categories flagged as 隔週", () => {
  // No areaCode: the resolver falls back to suppression rather than guess.
  const districtWithBiweekly: District = {
    id: "test-biweekly",
    label: "テスト地区",
    addresses: ["テスト"],
    schedule: {
      burnable: ["mon", "thu"],
      non_burnable: ["sat"], // upstream said 「（隔週）土」
      resource_plastic: ["fri"],
      container_plastic: ["wed"],
      pet_bottle: ["fri"],
      bottles_cans: ["fri"],
      bulky: [],
      biweekly: { non_burnable: true },
    },
  };

  // Saturday Jan 3, 2026 — would be a non_burnable day under naive weekly rules.
  const saturday = new Date("2026-01-03T00:00:00");

  it("suppresses biweekly categories when no areaCode is known", () => {
    // Without an anchor we must NOT guess — over-emission is worse than
    // a known gap that the UI can call out.
    const result = resolveSchedule(districtWithBiweekly, [], {
      from: saturday,
      to: saturday,
    });
    expect(result).toHaveLength(0);
  });

  it("still emits non-biweekly categories on their normal weekdays", () => {
    const monday = new Date("2026-01-05T00:00:00");
    const result = resolveSchedule(districtWithBiweekly, [], {
      from: monday,
      to: monday,
    });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toEqual(["burnable"]);
  });

  it("biweeklyCategories surfaces the flagged categories with their weekday", () => {
    const flagged = biweeklyCategories(districtWithBiweekly);
    expect(flagged).toEqual([{ category: "non_burnable", weekday: "sat" }]);
  });

  it("biweeklyCategories returns empty when the district has no biweekly streams", () => {
    const plainDistrict: District = {
      ...districtWithBiweekly,
      schedule: { ...districtWithBiweekly.schedule, biweekly: undefined },
    };
    expect(biweeklyCategories(plainDistrict)).toEqual([]);
  });
});

describe("biweekly handling — anchor-driven emission (area code 1)", () => {
  // Area 1 calendar from Koto-ku's official site:
  // 隔週月曜 anchored on 2026-04-06 (Mon). Expected hits in April:
  //   2026-04-06 (Mon)  ✓
  //   2026-04-20 (Mon)  ✓
  // Skips:
  //   2026-04-13 (Mon — alternate week, no collection)
  const districtArea1: District = {
    id: "test-area1",
    label: "Area 1",
    addresses: ["test"],
    areaCode: 1,
    schedule: {
      burnable: [],
      non_burnable: ["mon"],
      resource_plastic: [],
      container_plastic: [],
      pet_bottle: [],
      bottles_cans: [],
      bulky: [],
      biweekly: { non_burnable: true },
    },
  };

  it("emits non_burnable on the anchor Monday", () => {
    const day = new Date("2026-04-06T00:00:00");
    const result = resolveSchedule(districtArea1, [], { from: day, to: day });
    expect(result).toHaveLength(1);
    expect(result[0].categories).toEqual(["non_burnable"]);
  });

  it("skips the alternating Monday (anchor + 7 days)", () => {
    const day = new Date("2026-04-13T00:00:00");
    const result = resolveSchedule(districtArea1, [], { from: day, to: day });
    expect(result).toHaveLength(0);
  });

  it("emits non_burnable on the next 14-day boundary", () => {
    const day = new Date("2026-04-20T00:00:00");
    const result = resolveSchedule(districtArea1, [], { from: day, to: day });
    expect(result).toHaveLength(1);
  });

  it("over a 4-week window the gaps between hits are exactly 14 days", () => {
    const result = resolveSchedule(districtArea1, [], {
      from: new Date("2026-04-01T00:00:00"),
      to: new Date("2026-05-31T00:00:00"),
    });
    expect(result.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < result.length; i += 1) {
      const diffDays =
        (result[i].date.getTime() - result[i - 1].date.getTime()) /
        (24 * 60 * 60 * 1000);
      expect(Math.round(diffDays)).toBe(14);
    }
  });
});

describe("biweekly handling — anchor-driven emission (area code 6 vs 12)", () => {
  // Areas 6 and 12 share the same weekday (土) but different anchors.
  // 6: anchor 2026-04-11 (Sat). 12: anchor 2026-04-04 (Sat).
  // On 2026-04-11 only area 6 should fire; on 2026-04-04 only area 12.
  function district(areaCode: number): District {
    return {
      id: `test-area${areaCode}`,
      label: `Area ${areaCode}`,
      addresses: ["test"],
      areaCode,
      schedule: {
        burnable: [],
        non_burnable: ["sat"],
        resource_plastic: [],
        container_plastic: [],
        pet_bottle: [],
        bottles_cans: [],
        bulky: [],
        biweekly: { non_burnable: true },
      },
    };
  }

  it("area 6 fires on 04-11 but not on 04-04", () => {
    const a = district(6);
    expect(
      resolveSchedule(a, [], {
        from: new Date("2026-04-11T00:00:00"),
        to: new Date("2026-04-11T00:00:00"),
      }),
    ).toHaveLength(1);
    expect(
      resolveSchedule(a, [], {
        from: new Date("2026-04-04T00:00:00"),
        to: new Date("2026-04-04T00:00:00"),
      }),
    ).toHaveLength(0);
  });

  it("area 12 fires on 04-04 but not on 04-11", () => {
    const a = district(12);
    expect(
      resolveSchedule(a, [], {
        from: new Date("2026-04-04T00:00:00"),
        to: new Date("2026-04-04T00:00:00"),
      }),
    ).toHaveLength(1);
    expect(
      resolveSchedule(a, [], {
        from: new Date("2026-04-11T00:00:00"),
        to: new Date("2026-04-11T00:00:00"),
      }),
    ).toHaveLength(0);
  });
});

describe("resolveSchedule — overlay with explicit categories (supplementary)", () => {
  it("substitutes the entire day's collection set with the overlay categories", () => {
    // On Wed (normally non_burnable), force a supplementary burnable-only day.
    const supplementaryOverlay: SpecialOverlay = {
      date: "2026-01-07",
      districts: ["test-kameido"],
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
