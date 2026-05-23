import { describe, it, expect } from "vitest";
import {
  formatAuditDateTime,
  formatDateTime,
  formatDayWithWeekday,
  formatFullDate,
  formatTimeOfDay,
  formatYearMonth,
} from "./datetime";

// A Saturday afternoon in JST so every helper exercises a weekday name
// alongside a non-trivial month/day. Using an ISO string keeps the test
// independent of the runner's local timezone.
const SAT_AFTERNOON_ISO = "2026-05-23T13:11:00+09:00";
const SAT_AFTERNOON = new Date(SAT_AFTERNOON_ISO);

describe("formatDayWithWeekday", () => {
  it("renders M月D日(曜) for a Date", () => {
    expect(formatDayWithWeekday(SAT_AFTERNOON)).toBe("5月23日(土)");
  });

  it("accepts an ISO string", () => {
    expect(formatDayWithWeekday(SAT_AFTERNOON_ISO)).toBe("5月23日(土)");
  });

  it("returns the empty string for an invalid Date", () => {
    expect(formatDayWithWeekday(new Date("nope"))).toBe("");
  });
});

describe("formatDateTime", () => {
  it("renders M月D日 HH:mm without year", () => {
    expect(formatDateTime(SAT_AFTERNOON)).toBe("5月23日 13:11");
  });

  it("zero-pads minutes", () => {
    const d = new Date("2026-05-23T09:05:00+09:00");
    expect(formatDateTime(d)).toBe("5月23日 09:05");
  });
});

describe("formatFullDate", () => {
  it("includes the year", () => {
    expect(formatFullDate(SAT_AFTERNOON)).toBe("2026年5月23日");
  });
});

describe("formatAuditDateTime", () => {
  it("appends JST and includes the year", () => {
    expect(formatAuditDateTime(SAT_AFTERNOON)).toBe("2026年5月23日 13:11 JST");
  });
});

describe("formatYearMonth", () => {
  it("renders yyyy年M月", () => {
    expect(formatYearMonth(SAT_AFTERNOON)).toBe("2026年5月");
  });
});

describe("formatTimeOfDay", () => {
  it("renders HH:mm", () => {
    expect(formatTimeOfDay(SAT_AFTERNOON)).toBe("13:11");
  });
});
