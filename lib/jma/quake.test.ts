import { describe, it, expect } from "vitest";
import { buildQuakeFeed } from "./quake";
import type { JmaQuakeList } from "@/lib/opendata/schemas/jma-quake";

const KOTO = "1310800";
const KOTO_INT = [{ code: "13", maxi: "2", city: [{ code: KOTO, maxi: "2" }] }];

function makeEvent(overrides: Partial<JmaQuakeList[number]> = {}): JmaQuakeList[number] {
  return {
    eid: "20260515202209",
    rdt: "2026-05-15T20:22:00+09:00",
    ttl: "震源・震度情報",
    at: "2026-05-15T20:22:00+09:00",
    anm: "宮城県沖",
    mag: "5.4",
    maxi: "5-",
    int: KOTO_INT,
    ...overrides,
  };
}

describe("buildQuakeFeed", () => {
  it("keeps only events observed in 江東区 and trims to limit", () => {
    const events: JmaQuakeList = [
      makeEvent({ eid: "felt-1" }),
      makeEvent({
        eid: "not-felt",
        int: [{ code: "02", maxi: "2", city: [{ code: "0220300", maxi: "2" }] }],
      }),
      makeEvent({ eid: "felt-2" }),
      makeEvent({ eid: "felt-3" }),
    ];
    const feed = buildQuakeFeed(events, KOTO, 2);
    expect(feed.events.map((e) => e.eventId)).toEqual(["felt-1", "felt-2"]);
  });

  it("populates kotoShindo from the 江東区 city entry", () => {
    const events: JmaQuakeList = [
      makeEvent({
        int: [{ code: "13", maxi: "3", city: [{ code: KOTO, maxi: "3" }] }],
      }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events[0]?.kotoShindo).toBe("3");
  });

  it("excludes events where 江東区 did not appear", () => {
    const events: JmaQuakeList = [
      makeEvent({
        int: [{ code: "02", maxi: "2", city: [{ code: "0220300", maxi: "2" }] }],
      }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events).toHaveLength(0);
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

  // JMA emits several reports per quake sharing one eid (震度速報 → 震源・震度
  // 情報). They must collapse to a single row, else the same quake repeats and
  // the duplicate eids collide as React keys.
  it("collapses multiple reports of the same eid into one, keeping latest ctt", () => {
    const events: JmaQuakeList = [
      makeEvent({ ctt: "20260626224113", ttl: "震源・震度情報", mag: "4.1" }),
      makeEvent({ ctt: "20260626223412", ttl: "震源・震度情報", mag: "4.0" }),
      makeEvent({ ctt: "20260626223047", ttl: "震度速報", mag: undefined }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]?.magnitude).toBe("4.1");
  });

  it("keeps distinct eids as separate events", () => {
    const events: JmaQuakeList = [
      makeEvent({ eid: "quake-a", ctt: "20260626224113" }),
      makeEvent({ eid: "quake-b", ctt: "20260626223412" }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events.map((e) => e.eventId)).toEqual(["quake-a", "quake-b"]);
  });

  it("keeps the first occurrence when ctt is absent (upstream is latest-first)", () => {
    const events: JmaQuakeList = [
      makeEvent({ mag: "5.4" }),
      makeEvent({ mag: "5.0" }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]?.magnitude).toBe("5.4");
  });

  // Regression: a 6弱 quake (江東区 震度3) vanished because its latest revision
  // by ctt was 「顕著な地震の震源要素更新のお知らせ」 — a follow-up with NO int
  // block. Picking it erased the ward shindo and the event dropped from the
  // feed. A revision carrying intensity must win over a later one without it.
  it("prefers a revision with intensity data over a later one without it", () => {
    const events: JmaQuakeList = [
      // Latest by ctt, but no int (source-element update notice).
      makeEvent({
        ctt: "20260627004006",
        ttl: "顕著な地震の震源要素更新のお知らせ",
        maxi: undefined,
        int: undefined,
      }),
      // Earlier, but carries the 江東区 shindo we need.
      makeEvent({
        ctt: "20260626224113",
        ttl: "震源・震度情報",
        maxi: "6-",
        int: [{ code: "13", maxi: "3", city: [{ code: KOTO, maxi: "3" }] }],
      }),
    ];
    const feed = buildQuakeFeed(events, KOTO);
    expect(feed.events).toHaveLength(1);
    expect(feed.events[0]?.kotoShindo).toBe("3");
    expect(feed.events[0]?.maxShindo).toBe("6-");
  });
});
