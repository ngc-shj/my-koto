import { describe, it, expect } from "vitest";
import { filterEvents } from "./EventsClient";
import type { Event } from "@/lib/events/types";

function event(overrides: Partial<Event> = {}): Event {
  return {
    id: "e-1",
    title: "親子で楽しむ夏まつり",
    startDate: "2026-07-20",
    location: "亀戸中央公園",
    description: "縁日と盆踊り。雨天時は屋内開催。",
    organizer: "江東区",
    status: "confirmed",
    ...overrides,
  };
}

describe("filterEvents", () => {
  it("returns every event when the query is empty or whitespace", () => {
    const all = [event({ id: "a" }), event({ id: "b" })];
    expect(filterEvents(all, "").map((e) => e.id)).toEqual(["a", "b"]);
    expect(filterEvents(all, "   ").map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("matches the title", () => {
    const a = event({ id: "a", title: "夏まつり" });
    const b = event({ id: "b", title: "確定申告相談会" });
    expect(filterEvents([a, b], "まつり").map((e) => e.id)).toEqual(["a"]);
  });

  it("matches the location", () => {
    const a = event({ id: "a", title: "A", location: "豊洲文化センター" });
    const b = event({ id: "b", title: "B", location: "亀戸中央公園" });
    expect(filterEvents([a, b], "豊洲").map((e) => e.id)).toEqual(["a"]);
  });

  it("matches the organizer", () => {
    const a = event({ id: "a", organizer: "深川消防署" });
    const b = event({ id: "b", organizer: "江東区" });
    expect(filterEvents([a, b], "消防").map((e) => e.id)).toEqual(["a"]);
  });

  it("matches case-insensitively for ASCII queries", () => {
    const a = event({ id: "a", title: "PTA 親子イベント" });
    expect(filterEvents([a], "pta")).toHaveLength(1);
  });

  it("returns an empty array when nothing matches", () => {
    const a = event({ id: "a", title: "夏まつり", description: "盆踊り" });
    expect(filterEvents([a], "存在しない")).toEqual([]);
  });
});
