import { describe, it, expect } from "vitest";
import { escalateBannerWarnings, pickBannerQuake } from "./banner";
import type { AreaWarnings } from "./normalize";
import type { NormalizedQuake, QuakeFeed } from "./quake";

function makeWarningData(warnings: AreaWarnings["warnings"]): AreaWarnings {
  return {
    reportDatetime: "2026-05-23T10:09:00+09:00",
    headlineText: "",
    publishingOffice: "気象庁",
    areaCode: "1310800",
    warnings,
    topTier: warnings[0]?.tier ?? null,
  };
}

describe("escalateBannerWarnings", () => {
  it("returns null when there are no active warnings", () => {
    expect(escalateBannerWarnings(makeWarningData([]))).toBeNull();
  });

  it("drops 注意報 entries and returns null when only advisories remain", () => {
    const data = makeWarningData([
      { code: "15", label: "強風注意報", tier: "advisory", status: "継続" },
      { code: "16", label: "波浪注意報", tier: "advisory", status: "継続" },
    ]);
    expect(escalateBannerWarnings(data)).toBeNull();
  });

  it("picks warning tier when only warnings are active", () => {
    const data = makeWarningData([
      { code: "03", label: "大雨警報", tier: "warning", status: "発表" },
      { code: "15", label: "強風注意報", tier: "advisory", status: "継続" },
    ]);
    const result = escalateBannerWarnings(data);
    expect(result?.topTier).toBe("warning");
    expect(result?.warnings.map((w) => w.label)).toEqual(["大雨警報"]);
  });

  it("picks special tier when 特別警報 is present", () => {
    const data = makeWarningData([
      { code: "33", label: "大雨特別警報", tier: "special", status: "発表" },
      { code: "03", label: "大雨警報", tier: "warning", status: "発表" },
    ]);
    const result = escalateBannerWarnings(data);
    expect(result?.topTier).toBe("special");
    expect(result?.warnings).toHaveLength(2);
  });
});

function makeQuake(overrides: Partial<NormalizedQuake> = {}): NormalizedQuake {
  return {
    eventId: "evt-1",
    title: "震源・震度情報",
    reportDatetime: "2026-05-23T13:00:00+09:00",
    occurredAt: "2026-05-23T13:00:00+09:00",
    epicenter: "千葉県北西部",
    magnitude: "4.2",
    maxShindo: "3",
    kotoShindo: "2",
    ...overrides,
  };
}

function quakeFeed(events: NormalizedQuake[]): QuakeFeed {
  return {
    events,
    feltInKotoCount: events.filter((e) => e.kotoShindo != null).length,
  };
}

const NOW = new Date("2026-05-23T14:00:00+09:00");

describe("pickBannerQuake", () => {
  it("picks a recent Koto-felt quake at or above 震度 2", () => {
    expect(pickBannerQuake(quakeFeed([makeQuake()]), NOW)?.eventId).toBe(
      "evt-1",
    );
  });

  it("skips quakes the ward did not feel", () => {
    const q = makeQuake({ kotoShindo: null });
    expect(pickBannerQuake(quakeFeed([q]), NOW)).toBeNull();
  });

  it("skips quakes below 震度 2", () => {
    const q = makeQuake({ kotoShindo: "1" });
    expect(pickBannerQuake(quakeFeed([q]), NOW)).toBeNull();
  });

  it("treats 震度 5-/5+ as eligible (parses the digit prefix)", () => {
    const q = makeQuake({ kotoShindo: "5-" });
    expect(pickBannerQuake(quakeFeed([q]), NOW)?.kotoShindo).toBe("5-");
  });

  it("skips quakes older than 24 hours", () => {
    const q = makeQuake({ occurredAt: "2026-05-21T13:00:00+09:00" });
    expect(pickBannerQuake(quakeFeed([q]), NOW)).toBeNull();
  });

  it("returns the first eligible quake when several are present", () => {
    const a = makeQuake({
      eventId: "old",
      occurredAt: "2026-05-21T13:00:00+09:00",
    });
    const b = makeQuake({ eventId: "fresh" });
    expect(pickBannerQuake(quakeFeed([b, a]), NOW)?.eventId).toBe("fresh");
  });

  it("returns null on empty feed", () => {
    expect(pickBannerQuake(quakeFeed([]), NOW)).toBeNull();
  });
});
