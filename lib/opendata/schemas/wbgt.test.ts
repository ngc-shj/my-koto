import { describe, it, expect } from "vitest";
import { WbgtDataSchema } from "./wbgt";
import validFixture from "@/__fixtures__/schemas/wbgt/valid.json";
import invalidFixture from "@/__fixtures__/schemas/wbgt/invalid.json";

describe("WbgtDataSchema", () => {
  it("accepts a valid WBGT data fixture", () => {
    const result = WbgtDataSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid WBGT data fixture (value > 50)", () => {
    const result = WbgtDataSchema.safeParse(invalidFixture);
    expect(result.success).toBe(false);
  });

  it("rejects WBGT value below 0", () => {
    const result = WbgtDataSchema.safeParse({
      fetchedAt: "2026-08-01T05:00:00+09:00",
      readings: [{ station: "東京", datetime: "2026-08-01T05:00:00+09:00", wbgt: -1 }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts WBGT value at boundary (0 and 50)", () => {
    const result = WbgtDataSchema.safeParse({
      fetchedAt: "2026-08-01T05:00:00+09:00",
      readings: [
        { station: "東京", datetime: "2026-08-01T05:00:00+09:00", wbgt: 0 },
        { station: "東京", datetime: "2026-08-01T14:00:00+09:00", wbgt: 50 },
      ],
    });
    expect(result.success).toBe(true);
  });
});
