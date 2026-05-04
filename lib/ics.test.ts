import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildEventIcs, buildGomiIcs } from "./ics";
import type { Event } from "@/lib/events/types";
import type { District, GomiOccurrence } from "@/lib/gomi/types";

// Fixed deps for deterministic tests.
const FIXED_NOW = new Date("2026-01-01T00:00:00+09:00");
const FIXED_UUID = "00000000-0000-0000-0000-000000000001";
const fixedDeps = { now: () => FIXED_NOW, uuid: () => FIXED_UUID };

// ---------- helpers ----------

function sampleEvent(overrides: Partial<Event> = {}): Event {
  return {
    id: "evt-test",
    title: "テストイベント",
    startDate: "2026-05-01",
    endDate: "2026-05-02",
    location: "テスト会場",
    description: "テストの説明",
    url: "https://example.com/event",
    status: "confirmed",
    ...overrides,
  };
}

function sampleDistrict(): District {
  return {
    id: "kameido-1",
    label: "亀戸1丁目",
    addresses: ["亀戸1丁目"],
    schedule: {
      burnable: ["mon", "thu"],
      non_burnable: ["wed"],
      resource_plastic: ["fri"],
      container_plastic: [],
      pet_bottle: ["tue"],
      bottles_cans: ["wed"],
      bulky: [],
    },
  };
}

function sampleOccurrences(): GomiOccurrence[] {
  return [
    { date: new Date("2026-05-04T00:00:00Z"), categories: ["burnable"] },
    { date: new Date("2026-05-07T00:00:00Z"), categories: ["non_burnable", "bottles_cans"] },
  ];
}

// ---------- buildEventIcs ----------

describe("buildEventIcs — VTIMEZONE", () => {
  it("includes VTIMEZONE block with TZID:Asia/Tokyo", () => {
    const ics = buildEventIcs([sampleEvent()], fixedDeps);
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:Asia/Tokyo");
    expect(ics).toContain("END:VTIMEZONE");
  });
});

describe("buildEventIcs — STATUS:CANCELLED", () => {
  it("emits STATUS:CANCELLED for cancelled events", () => {
    const ics = buildEventIcs([sampleEvent({ status: "cancelled" })], fixedDeps);
    expect(ics).toContain("STATUS:CANCELLED");
  });

  it("does not emit STATUS:CANCELLED for confirmed events", () => {
    const ics = buildEventIcs([sampleEvent({ status: "confirmed" })], fixedDeps);
    expect(ics).not.toContain("STATUS:CANCELLED");
  });

  it("emits STATUS:CONFIRMED for confirmed events", () => {
    const ics = buildEventIcs([sampleEvent({ status: "confirmed" })], fixedDeps);
    expect(ics).toContain("STATUS:CONFIRMED");
  });
});

describe("buildEventIcs — text field escaping", () => {
  it("escapes comma in SUMMARY", () => {
    const ics = buildEventIcs([sampleEvent({ title: "A,B" })], fixedDeps);
    expect(ics).toContain("SUMMARY:A\\,B");
  });

  it("escapes semicolon in SUMMARY", () => {
    const ics = buildEventIcs([sampleEvent({ title: "A;B" })], fixedDeps);
    expect(ics).toContain("SUMMARY:A\\;B");
  });

  it("escapes backslash in SUMMARY", () => {
    const ics = buildEventIcs([sampleEvent({ title: "A\\B" })], fixedDeps);
    expect(ics).toContain("SUMMARY:A\\\\B");
  });

  it("escapes newline in SUMMARY", () => {
    const ics = buildEventIcs([sampleEvent({ title: "A\nB" })], fixedDeps);
    expect(ics).toContain("SUMMARY:A\\nB");
  });

  it("escapes comma in DESCRIPTION", () => {
    const ics = buildEventIcs([sampleEvent({ description: "A,B" })], fixedDeps);
    expect(ics).toContain("DESCRIPTION:A\\,B");
  });

  it("escapes semicolon in DESCRIPTION", () => {
    const ics = buildEventIcs([sampleEvent({ description: "A;B" })], fixedDeps);
    expect(ics).toContain("DESCRIPTION:A\\;B");
  });

  it("escapes backslash in DESCRIPTION", () => {
    const ics = buildEventIcs([sampleEvent({ description: "A\\B" })], fixedDeps);
    expect(ics).toContain("DESCRIPTION:A\\\\B");
  });

  it("escapes newline in DESCRIPTION", () => {
    const ics = buildEventIcs([sampleEvent({ description: "A\nB" })], fixedDeps);
    expect(ics).toContain("DESCRIPTION:A\\nB");
  });

  it("escapes comma in LOCATION", () => {
    const ics = buildEventIcs([sampleEvent({ location: "A,B" })], fixedDeps);
    expect(ics).toContain("LOCATION:A\\,B");
  });

  it("escapes semicolon in LOCATION", () => {
    const ics = buildEventIcs([sampleEvent({ location: "A;B" })], fixedDeps);
    expect(ics).toContain("LOCATION:A\\;B");
  });

  it("escapes backslash in LOCATION", () => {
    const ics = buildEventIcs([sampleEvent({ location: "A\\B" })], fixedDeps);
    expect(ics).toContain("LOCATION:A\\\\B");
  });

  it("escapes newline in LOCATION", () => {
    const ics = buildEventIcs([sampleEvent({ location: "A\nB" })], fixedDeps);
    expect(ics).toContain("LOCATION:A\\nB");
  });

  it("escapes comma in COMMENT (via note field)", () => {
    const ics = buildEventIcs([sampleEvent({ note: "A,B" })], fixedDeps);
    expect(ics).toContain("COMMENT:A\\,B");
  });

  it("escapes semicolon in COMMENT", () => {
    const ics = buildEventIcs([sampleEvent({ note: "A;B" })], fixedDeps);
    expect(ics).toContain("COMMENT:A\\;B");
  });

  it("escapes backslash in COMMENT", () => {
    const ics = buildEventIcs([sampleEvent({ note: "A\\B" })], fixedDeps);
    expect(ics).toContain("COMMENT:A\\\\B");
  });

  it("escapes newline in COMMENT", () => {
    const ics = buildEventIcs([sampleEvent({ note: "A\nB" })], fixedDeps);
    expect(ics).toContain("COMMENT:A\\nB");
  });
});

describe("buildGomiIcs — CATEGORIES escaping", () => {
  it("includes category names in CATEGORIES", () => {
    const ics = buildGomiIcs(sampleDistrict(), sampleOccurrences(), fixedDeps);
    expect(ics).toContain("CATEGORIES:燃やすごみ");
  });
});

describe("buildEventIcs — CRLF line endings", () => {
  it("uses CRLF line endings throughout the output", () => {
    const ics = buildEventIcs([sampleEvent()], fixedDeps);
    // Every line separator must be CRLF.
    // Split on CRLF and verify no bare LF remains (other than inside escaped values).
    const withoutCRLF = ics.split("\r\n").join("");
    expect(withoutCRLF).not.toContain("\n");
  });

  it("starts with BEGIN:VCALENDAR and ends with END:VCALENDAR", () => {
    const ics = buildEventIcs([sampleEvent()], fixedDeps);
    const lines = ics.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    // ICS does not end with a trailing CRLF, so last element is "END:VCALENDAR".
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");
  });
});

describe("buildEventIcs — UID determinism", () => {
  it("uses <event-id>@koto-city.example as UID", () => {
    const evt = sampleEvent({ id: "my-event-42" });
    const ics = buildEventIcs([evt], fixedDeps);
    expect(ics).toContain("UID:my-event-42@koto-city.example");
  });

  it("produces the same UID on repeated calls with the same input", () => {
    const evt = sampleEvent({ id: "stable-id" });
    const ics1 = buildEventIcs([evt], fixedDeps);
    const ics2 = buildEventIcs([evt], fixedDeps);
    const uid1 = ics1.split("\r\n").find((l) => l.startsWith("UID:"));
    const uid2 = ics2.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(uid1).toBe(uid2);
  });
});

describe("buildEventIcs — DTSTAMP fixed via deps.now()", () => {
  it("uses fixed timestamp when deps.now() is provided", () => {
    const ics = buildEventIcs([sampleEvent()], fixedDeps);
    // FIXED_NOW = 2026-01-01T00:00:00+09:00
    // ical-generator formats DTSTAMP as the input Date value's UTC representation
    // but when a timezone is set on the calendar, it uses local time.
    // The DTSTAMP line must start with DTSTAMP: followed by the fixed date/time.
    const dtstampLine = ics.split("\r\n").find((l) => l.startsWith("DTSTAMP:"));
    expect(dtstampLine).toBeDefined();
    // The value should be deterministic (not the current time).
    // Check it contains the fixed date portion.
    expect(dtstampLine).toMatch(/^DTSTAMP:2026/);
  });
});

// ---------- Negative: LOCATION injection ----------

describe("buildEventIcs — iCalendar injection prevention", () => {
  it("does not produce extra BEGIN:VEVENT from LOCATION injection attempt", () => {
    const malicious = "Venue\r\nBEGIN:VEVENT\r\nUID:injected@evil\r\nEND:VEVENT";
    const ics = buildEventIcs(
      [sampleEvent({ location: malicious })],
      fixedDeps,
    );
    // Count BEGIN:VEVENT as standalone lines (line-start check prevents
    // counting escaped text embedded in field values).
    const lines = ics.split("\r\n");
    const beginCount = lines.filter((l) => l === "BEGIN:VEVENT").length;
    expect(beginCount).toBe(1);
  });

  it("does not produce extra BEGIN:VEVENT from COMMENT injection attempt", () => {
    const malicious = "Note\r\nBEGIN:VEVENT\r\nUID:injected@evil\r\nEND:VEVENT";
    const ics = buildEventIcs(
      [sampleEvent({ note: malicious })],
      fixedDeps,
    );
    const lines = ics.split("\r\n");
    const beginCount = lines.filter((l) => l === "BEGIN:VEVENT").length;
    expect(beginCount).toBe(1);
  });
});

// ---------- Negative: URL scheme validation ----------

describe("buildEventIcs — URL scheme validation", () => {
  it("omits URL property when url is javascript: scheme", () => {
    // The EventSchema Zod refine blocks non-https URLs, but buildEventIcs also
    // applies safeUrl() as a defence-in-depth guard.
    // We pass the value directly bypassing Zod to test the guard.
    const evt = { ...sampleEvent(), url: "javascript:alert(1)" } as unknown as Event;
    const ics = buildEventIcs([evt], fixedDeps);
    // Must not contain a URL iCalendar property (the RFC 5545 URL property).
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith("URL"))).toBe(false);
  });

  it("omits URL property when url is data: scheme", () => {
    const evt = { ...sampleEvent(), url: "data:text/html,<script>alert(1)</script>" } as unknown as Event;
    const ics = buildEventIcs([evt], fixedDeps);
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith("URL"))).toBe(false);
  });

  it("includes URL for valid https: scheme", () => {
    const ics = buildEventIcs(
      [sampleEvent({ url: "https://example.com/event" })],
      fixedDeps,
    );
    expect(ics).toContain("URL;VALUE=URI:https://example.com/event");
  });

  it("omits URL property when url is not provided", () => {
    const ics = buildEventIcs([sampleEvent({ url: undefined })], fixedDeps);
    const lines = ics.split("\r\n");
    expect(lines.some((l) => l.startsWith("URL"))).toBe(false);
  });
});

// ---------- buildGomiIcs — basic structure ----------

describe("buildGomiIcs — structure", () => {
  it("includes VTIMEZONE block with TZID:Asia/Tokyo", () => {
    const ics = buildGomiIcs(sampleDistrict(), sampleOccurrences(), fixedDeps);
    expect(ics).toContain("TZID:Asia/Tokyo");
  });

  it("includes VEVENT for each occurrence", () => {
    const ics = buildGomiIcs(sampleDistrict(), sampleOccurrences(), fixedDeps);
    const count = (ics.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(count).toBe(sampleOccurrences().length);
  });

  it("uses deterministic UID: <district-id>-<date>@koto-city.example", () => {
    const ics = buildGomiIcs(sampleDistrict(), sampleOccurrences(), fixedDeps);
    expect(ics).toContain("UID:kameido-1-2026-05-04@koto-city.example");
  });

  it("uses CRLF line endings", () => {
    const ics = buildGomiIcs(sampleDistrict(), sampleOccurrences(), fixedDeps);
    const withoutCRLF = ics.split("\r\n").join("");
    expect(withoutCRLF).not.toContain("\n");
  });
});
