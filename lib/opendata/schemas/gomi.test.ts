import { describe, it, expect } from "vitest";
import { GomiResponseSchema } from "./gomi";
import validFixture from "@/__fixtures__/schemas/gomi/valid.json";
import invalidFixture from "@/__fixtures__/schemas/gomi/invalid.json";

describe("GomiResponseSchema", () => {
  it("accepts a valid gomi response fixture", () => {
    const result = GomiResponseSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid gomi response fixture (invalid weekday enum + missing 地区ID)", () => {
    const result = GomiResponseSchema.safeParse(invalidFixture);
    expect(result.success).toBe(false);
  });

  it("rejects unknown weekday values", () => {
    const result = GomiResponseSchema.safeParse({
      result: {
        records: [
          {
            地区ID: "test-1",
            地区名: "テスト1丁目",
            燃やすごみ: ["monday"],
          },
        ],
      },
    });
    expect(result.success).toBe(false);
  });
});
