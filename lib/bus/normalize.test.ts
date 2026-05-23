import { describe, it, expect } from "vitest";
import {
  parseBusTimeMinutes,
  formatBusTime,
  categorizeServiceDay,
  nextDepartures,
} from "./normalize";

describe("parseBusTimeMinutes", () => {
  it("parses HH:MM", () => {
    expect(parseBusTimeMinutes("07:30")).toBe(7 * 60 + 30);
  });

  it("parses HH:MM:SS by ignoring seconds", () => {
    expect(parseBusTimeMinutes("07:30:00")).toBe(7 * 60 + 30);
  });

  it("accepts hours >= 24 (GTFS service-day convention)", () => {
    expect(parseBusTimeMinutes("25:30")).toBe(25 * 60 + 30);
  });

  it("returns null for malformed input", () => {
    expect(parseBusTimeMinutes("7:60")).toBeNull();
    expect(parseBusTimeMinutes("nope")).toBeNull();
    expect(parseBusTimeMinutes("")).toBeNull();
  });
});

describe("formatBusTime", () => {
  it("renders sub-24h times as HH:MM", () => {
    expect(formatBusTime("07:30")).toBe("07:30");
  });

  it("folds 24h+ times back with a 翌 prefix", () => {
    expect(formatBusTime("25:30")).toBe("翌01:30");
    expect(formatBusTime("24:05")).toBe("翌00:05");
  });

  it("returns the original token if malformed", () => {
    expect(formatBusTime("nope")).toBe("nope");
  });
});

describe("categorizeServiceDay", () => {
  it("returns weekday for Monday–Friday", () => {
    // 2026-05-25 is a Monday
    expect(categorizeServiceDay(new Date("2026-05-25T10:00:00+09:00"))).toBe(
      "weekday",
    );
  });

  it("returns saturday for Saturday", () => {
    expect(categorizeServiceDay(new Date("2026-05-23T10:00:00+09:00"))).toBe(
      "saturday",
    );
  });

  it("returns sunday for Sunday", () => {
    expect(categorizeServiceDay(new Date("2026-05-24T10:00:00+09:00"))).toBe(
      "sunday",
    );
  });
});

describe("nextDepartures", () => {
  const departures = {
    stopId: "stop-1",
    times: ["06:30", "07:00", "07:30", "08:00", "25:30"],
  };

  it("returns upcoming times sorted in the GTFS order", () => {
    const now = new Date("2026-05-23T07:15:00+09:00");
    expect(nextDepartures(departures, now, 3)).toEqual([
      "07:30",
      "08:00",
      "25:30",
    ]);
  });

  it("returns an empty array when there are no upcoming times today", () => {
    const now = new Date("2026-05-23T26:00:00+09:00");
    expect(nextDepartures(departures, now)).toEqual([]);
  });

  it("returns empty when departures is undefined", () => {
    const now = new Date("2026-05-23T07:00:00+09:00");
    expect(nextDepartures(undefined, now)).toEqual([]);
  });

  it("respects the limit argument", () => {
    const now = new Date("2026-05-23T00:00:00+09:00");
    expect(nextDepartures(departures, now, 2)).toEqual(["06:30", "07:00"]);
  });
});
