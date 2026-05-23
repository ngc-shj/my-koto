import { describe, it, expect } from "vitest";
import { buildQuakeFeed } from "./quake";
import type { JmaQuakeList } from "@/lib/opendata/schemas/jma-quake";

const KOTO = "1310800";

function makeEvent(overrides: Partial<JmaQuakeList[number]> = {}): JmaQuakeList[number] {
  return {
    eid: "20260515202209",
    rdt: "2026-05-15T20:22:00+09:00",
    ttl: "震源・震度情報",
    at: "2026-05-15T20:22:00+09:00",
    anm: "宮城県沖",
    mag: "5.4",
    maxi: "5-",
    int: [],
    ...overrides,
  };
}

describe("buildQuakeFeed", () => {
  it("trims to limit and preserves upstream order", () => {
    const events: JmaQuakeList = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ eid: `evt-${i}` }),
    );
    const feed = buildQuakeFeed(events, KOTO, 5);
    expect(feed.events.map((e) => e.eventId)).toEqual([
      "evt-0",
      "evt-1",
      "evt-2",
      "evt-3",
      "evt-4",
    ]);
  });

  it("populates kotoShindo when 江東区 is in the city list", () => {
    const events: JmaQuakeList = [
      makeEvent({
        int: [{ code: "13", maxi: "2", city: [{ code: KOTO, maxi: "2" }] }],
      }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events[0]?.kotoShindo).toBe("2");
    expect(feed.feltInKotoCount).toBe(1);
  });

  it("leaves kotoShindo null when 江東区 did not appear", () => {
    const events: JmaQuakeList = [
      makeEvent({
        int: [{ code: "02", maxi: "2", city: [{ code: "0220300", maxi: "2" }] }],
      }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events[0]?.kotoShindo).toBeNull();
    expect(feed.feltInKotoCount).toBe(0);
  });

  it("falls back to rdt when at is missing", () => {
    const events: JmaQuakeList = [
      makeEvent({ at: undefined, rdt: "2026-05-15T20:22:00+09:00" }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events[0]?.occurredAt).toBe("2026-05-15T20:22:00+09:00");
  });

  it("uses 震源不明 when anm is missing", () => {
    const events: JmaQuakeList = [makeEvent({ anm: undefined })];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events[0]?.epicenter).toBe("震源不明");
  });

  it("preserves null magnitude when JMA omits it", () => {
    const events: JmaQuakeList = [makeEvent({ mag: undefined })];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events[0]?.magnitude).toBeNull();
  });
});
