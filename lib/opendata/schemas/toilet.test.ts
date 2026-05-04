import { describe, it, expect } from "vitest";
import { ToiletResponseSchema } from "./toilet";
import validFixture from "@/__fixtures__/schemas/toilet/valid.json";
import invalidFixture from "@/__fixtures__/schemas/toilet/invalid.json";

describe("ToiletResponseSchema", () => {
  it("accepts a valid toilet response fixture", () => {
    const result = ToiletResponseSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid toilet response fixture (numeric coords)", () => {
    const result = ToiletResponseSchema.safeParse(invalidFixture);
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = ToiletResponseSchema.safeParse({ result: { records: [{ 住所: "test" }] } });
    expect(result.success).toBe(false);
  });
});
