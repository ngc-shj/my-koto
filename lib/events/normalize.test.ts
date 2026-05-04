import { describe, it, expect } from "vitest";
import { toEvent, filterUpcoming } from "./normalize";
import type { Event } from "./types";

describe("toEvent", () => {
  it("maps the upstream record into the in-app Event shape", () => {
    const record = {
      名称: "夏祭り",
      開始日: "2026-08-01",
      終了日: "2026-08-02",
      場所: "亀戸天神",
      住所: "江東区亀戸3-6-1",
      説明: "屋台あり",
      URL: "https://example.com/matsuri",
      主催: "亀戸天神",
      備考: "",
    };
    const event = toEvent(record, 0);
    expect(event.id).toBe("koto-event-1");
    expect(event.title).toBe("夏祭り");
    expect(event.startDate).toBe("2026-08-01");
    expect(event.endDate).toBe("2026-08-02");
    expect(event.url).toBe("https://example.com/matsuri");
    expect(event.status).toBe("confirmed");
  });

  it("flags 備考='中止' as cancelled status", () => {
    const event = toEvent(
      {
        名称: "中止イベント",
        開始日: "2026-08-01",
        備考: "中止",
      },
      5,
    );
    expect(event.status).toBe("cancelled");
    // Index-based id keeps the event uniquely addressable even when cancelled.
    expect(event.id).toBe("koto-event-6");
  });

  it("treats other 備考 strings as confirmed (default)", () => {
    const event = toEvent(
      {
        名称: "通常イベント",
        開始日: "2026-08-01",
        備考: "雨天決行",
      },
      0,
    );
    expect(event.status).toBe("confirmed");
    expect(event.note).toBe("雨天決行");
  });

  it("drops empty-string 備考 to undefined so EventSchema invariants hold", () => {
    const event = toEvent(
      { 名称: "x", 開始日: "2026-08-01", 備考: "" },
      0,
    );
    expect(event.note).toBeUndefined();
  });
});

describe("filterUpcoming", () => {
  // Anchor "today" so the assertions are reproducible on any wall clock.
  const NOW = new Date("2026-05-04T00:00:00+09:00");

  function event(id: string, startDate: string, endDate?: string): Event {
    return {
      id,
      title: "x",
      startDate,
      endDate,
      status: "confirmed",
    };
  }

  it("includes events whose start is within the window", () => {
    const result = filterUpcoming(
      [event("a", "2026-05-10")],
      NOW,
      90,
    );
    expect(result).toHaveLength(1);
  });

  it("excludes events that already ended before today", () => {
    const result = filterUpcoming(
      [event("past", "2026-04-01", "2026-04-30")],
      NOW,
      90,
    );
    expect(result).toHaveLength(0);
  });

  it("includes events whose end is exactly today", () => {
    const result = filterUpcoming(
      [event("ends-today", "2026-05-01", "2026-05-04")],
      NOW,
      90,
    );
    expect(result).toHaveLength(1);
  });

  it("excludes events whose start is past the window", () => {
    const result = filterUpcoming(
      [event("future", "2026-12-01")],
      NOW,
      90,
    );
    expect(result).toHaveLength(0);
  });

  it("respects custom window length", () => {
    const result = filterUpcoming(
      [event("d20", "2026-05-24"), event("d100", "2026-08-12")],
      NOW,
      30,
    );
    expect(result.map((e) => e.id)).toEqual(["d20"]);
  });
});
