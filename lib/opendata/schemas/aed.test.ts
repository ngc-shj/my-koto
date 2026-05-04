import { describe, it, expect } from "vitest";
import { AedResponseSchema } from "./aed";
import validFixture from "@/__fixtures__/schemas/aed/valid.json";
import invalidFixture from "@/__fixtures__/schemas/aed/invalid.json";

describe("AedResponseSchema", () => {
  it("accepts a valid AED response fixture", () => {
    const result = AedResponseSchema.safeParse(validFixture);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid AED response fixture (numeric name)", () => {
    const result = AedResponseSchema.safeParse(invalidFixture);
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const result = AedResponseSchema.safeParse({ result: { records: [{ 住所: "test" }] } });
    expect(result.success).toBe(false);
  });
});
