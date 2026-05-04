import { describe, expect, it } from "vitest";
import { buildPayload, readJstClock } from "./dispatch";
import type { District, SpecialOverlay } from "@/lib/gomi/types";

function makeDistrict(overrides: Partial<District> = {}): District {
  return {
    id: "toyosu",
    label: "豊洲",
    addresses: ["豊洲"],
    schedule: {
      burnable: ["mon", "thu"],
      non_burnable: [],
      resource_plastic: [],
      container_plastic: [],
      pet_bottle: ["fri"],
      bottles_cans: ["fri"],
      bulky: [],
    },
    ...overrides,
  };
}

describe("readJstClock", () => {
  it("converts UTC instant to JST hour and tomorrow's local-tz date", () => {
    // 2026-05-04T11:00:00Z = 2026-05-04T20:00:00+09:00 (JST 20:00)
    const now = new Date("2026-05-04T11:00:00Z");
    const clock = readJstClock(now);
    expect(clock.hour).toBe(20);
    // Tomorrow JST = 2026-05-05
    expect(clock.tomorrow.getFullYear()).toBe(2026);
    expect(clock.tomorrow.getMonth()).toBe(4); // May (0-indexed)
    expect(clock.tomorrow.getDate()).toBe(5);
  });

  it("rolls the date over correctly when JST is ahead of UTC", () => {
    // 2026-05-04T22:00:00Z = 2026-05-05T07:00:00+09:00 — JST already on the 5th
    const now = new Date("2026-05-04T22:00:00Z");
    const clock = readJstClock(now);
    expect(clock.hour).toBe(7);
    // Tomorrow JST = 2026-05-06
    expect(clock.tomorrow.getDate()).toBe(6);
  });
});

describe("buildPayload", () => {
  it("emits a notification when tomorrow has at least one collection", () => {
    const district = makeDistrict();
    // 2026-05-04 is a Monday — burnable per the fixture above.
    const tomorrow = new Date(2026, 4, 4);
    const overlays: SpecialOverlay[] = [];
    const payload = buildPayload(district, overlays, tomorrow);
    expect(payload).not.toBeNull();
    expect(payload?.title).toContain("5月4日");
    expect(payload?.body).toContain("豊洲");
    expect(payload?.body).toContain("燃やすごみ");
    expect(payload?.tag).toBe("gomi-toyosu-2026-05-04");
    expect(payload?.url).toBe("/gomi");
  });

  it("returns null when tomorrow has no collection", () => {
    const district = makeDistrict();
    // 2026-05-06 is Wednesday — no entry in the fixture above.
    const tomorrow = new Date(2026, 4, 6);
    const payload = buildPayload(district, [], tomorrow);
    expect(payload).toBeNull();
  });

  it("returns null when an overlay explicitly empties the day", () => {
    const district = makeDistrict();
    const tomorrow = new Date(2026, 4, 4); // would be burnable
    const overlays: SpecialOverlay[] = [
      {
        date: "2026-05-04",
        districts: ["toyosu"],
        categories: [],
        note: "Holiday — no collection",
      },
    ];
    const payload = buildPayload(district, overlays, tomorrow);
    expect(payload).toBeNull();
  });
});
