import { describe, it, expect } from "vitest";
import { EventResponseSchema } from "./events";
import validFixture from "@/__fixtures__/schemas/events/valid.json";
import invalidFixture from "@/__fixtures__/schemas/events/invalid.json";

describe("EventResponseSchema", () => {
  it("accepts a valid events response fixture", () => {
    const result = EventResponseSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid events response fixture (http URL + missing 開始日)", () => {
    const result = EventResponseSchema.safeParse(invalidFixture);
    expect(result.success).toBe(false);
  });

  it("rejects http (non-https) URL", () => {
    const result = EventResponseSchema.safeParse({
      result: {
        records: [
          {
            名称: "テストイベント",
            開始日: "2026-08-01",
            URL: "http://example.com",
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts https URL", () => {
    const result = EventResponseSchema.safeParse({
      result: {
        records: [
          {
            名称: "テストイベント",
            開始日: "2026-08-01",
            URL: "https://example.com",
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing URL field", () => {
    const result = EventResponseSchema.safeParse({
      result: {
        records: [
          {
            名称: "テストイベント",
            開始日: "2026-08-01",
          },
        ],
      },
    });
    expect(result.success).toBe(true);
  });
});
