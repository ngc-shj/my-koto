import { describe, expect, it } from "vitest";
import type {
  DirectionVariant,
  StopDepartures,
} from "@/lib/opendata/schemas/bus";
import { disambiguatedHeadsign, variantRestriction } from "./variants";

const emptySchedule = { weekday: [], saturday: [], sunday: [] };

function variant(
  variantId: string,
  headsign: string,
  stopSequence: readonly string[],
  tripCount = 0,
  schedule: {
    weekday?: readonly StopDepartures[];
    saturday?: readonly StopDepartures[];
    sunday?: readonly StopDepartures[];
  } = {},
): DirectionVariant {
  return {
    variantId,
    headsign,
    stopSequence,
    schedule: {
      weekday: schedule.weekday ?? [],
      saturday: schedule.saturday ?? [],
      sunday: schedule.sunday ?? [],
    },
    tripCount,
  };
}

const oneDep: StopDepartures = { stopId: "x", times: ["08:00"] };

describe("disambiguatedHeadsign", () => {
  it("returns raw headsign when only one variant uses it", () => {
    const a = variant("v0", "A行", ["x"]);
    const b = variant("v1", "B行", ["x", "y"]);
    expect(disambiguatedHeadsign(a, [a, b])).toBe("A行");
    expect(disambiguatedHeadsign(b, [a, b])).toBe("B行");
  });

  it("appends stop count when same headsign with unique counts", () => {
    const a = variant("v0", "A行", ["x", "y", "z"]);
    const b = variant("v1", "A行", ["x", "y"]);
    expect(disambiguatedHeadsign(a, [a, b])).toBe("A行 (3駅)");
    expect(disambiguatedHeadsign(b, [a, b])).toBe("A行 (2駅)");
  });

  it("falls back to 経路N index when stop counts also collide", () => {
    const a = variant("v0", "A行", ["x", "y"]);
    const b = variant("v1", "A行", ["x", "z"]);
    expect(disambiguatedHeadsign(a, [a, b])).toBe("A行 (経路1)");
    expect(disambiguatedHeadsign(b, [a, b])).toBe("A行 (経路2)");
  });

  it("disambiguates each headsign group independently", () => {
    // A行 group has unique stop counts; B行 group is single and stays raw.
    const a1 = variant("v0", "A行", ["x", "y", "z"]);
    const a2 = variant("v1", "A行", ["x", "y"]);
    const b1 = variant("v2", "B行", ["x"]);
    const all = [a1, a2, b1];
    expect(disambiguatedHeadsign(a1, all)).toBe("A行 (3駅)");
    expect(disambiguatedHeadsign(a2, all)).toBe("A行 (2駅)");
    expect(disambiguatedHeadsign(b1, all)).toBe("B行");
  });
});

describe("variantRestriction", () => {
  it("returns the single category when only one is served", () => {
    expect(
      variantRestriction(
        variant("v0", "A行", ["x"], 1, { saturday: [oneDep] }),
      ),
    ).toBe("saturday");
    expect(
      variantRestriction(
        variant("v1", "A行", ["x"], 1, { sunday: [oneDep] }),
      ),
    ).toBe("sunday");
    expect(
      variantRestriction(
        variant("v2", "A行", ["x"], 1, { weekday: [oneDep] }),
      ),
    ).toBe("weekday");
  });

  it("returns null when multiple categories are served", () => {
    expect(
      variantRestriction(
        variant("v0", "A行", ["x"], 1, {
          weekday: [oneDep],
          saturday: [oneDep],
        }),
      ),
    ).toBeNull();
  });

  it("returns null when no category is served", () => {
    expect(variantRestriction(variant("v0", "A行", ["x"]))).toBeNull();
  });
});
