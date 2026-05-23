import { describe, it, expect } from "vitest";
import { pickBannerQuake } from "./JmaQuakeBanner";
import type { NormalizedQuake, QuakeFeed } from "@/lib/jma/quake";

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

function feed(events: NormalizedQuake[]): QuakeFeed {
  return { events, feltInKotoCount: events.filter((e) => e.kotoShindo != null).length };
}

const NOW = new Date("2026-05-23T14:00:00+09:00");

describe("pickBannerQuake", () => {
  it("picks a recent Koto-felt quake at or above 震度 2", () => {
    expect(pickBannerQuake(feed([makeQuake()]), NOW)?.eventId).toBe("evt-1");
  });

  it("skips quakes the ward did not feel", () => {
    const q = makeQuake({ kotoShindo: null });
    expect(pickBannerQuake(feed([q]), NOW)).toBeNull();
  });

  it("skips quakes below 震度 2", () => {
    const q = makeQuake({ kotoShindo: "1" });
    expect(pickBannerQuake(feed([q]), NOW)).toBeNull();
  });

  it("treats 震度 5-/5+ as eligible (parses the digit prefix)", () => {
    const q = makeQuake({ kotoShindo: "5-" });
    expect(pickBannerQuake(feed([q]), NOW)?.kotoShindo).toBe("5-");
  });

  it("skips quakes older than 24 hours", () => {
    const q = makeQuake({ occurredAt: "2026-05-21T13:00:00+09:00" });
    expect(pickBannerQuake(feed([q]), NOW)).toBeNull();
  });

  it("returns the first eligible quake when several are present", () => {
    const a = makeQuake({ eventId: "old", occurredAt: "2026-05-21T13:00:00+09:00" });
    const b = makeQuake({ eventId: "fresh" });
    expect(pickBannerQuake(feed([b, a]), NOW)?.eventId).toBe("fresh");
  });

  it("returns null on empty feed", () => {
    expect(pickBannerQuake(feed([]), NOW)).toBeNull();
  });
});
