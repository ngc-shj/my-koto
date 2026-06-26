import { describe, it, expect } from "vitest";
import { KikukuruTargetTimesSchema } from "./jma-kikukuru";

describe("KikukuruTargetTimesSchema", () => {
  it("accepts a well-formed targetTimes array", () => {
    const raw = [
      {
        basetime: "20260626112000",
        validtime: "20260626112000",
        member: "immed0",
        elements: ["land", "inund", "flood"],
      },
      {
        basetime: "20260626105000",
        validtime: "20260626105000",
        member: "none",
      },
    ];
    const parsed = KikukuruTargetTimesSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it("rejects rows missing the basetime field", () => {
    const raw = [{ validtime: "20260626105000", member: "none" }];
    expect(KikukuruTargetTimesSchema.safeParse(raw).success).toBe(false);
  });

  it("rejects a non-array payload", () => {
    expect(KikukuruTargetTimesSchema.safeParse({ basetime: "x" }).success).toBe(
      false,
    );
  });
});
