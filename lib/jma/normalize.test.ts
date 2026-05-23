import { describe, it, expect } from "vitest";
import { extractAreaWarnings } from "./normalize";
import type { JmaWarningResponse } from "@/lib/opendata/schemas/jma-warning";

function buildPayload(args: {
  areaCode?: string;
  warnings?: { code?: string; status: string }[];
}): JmaWarningResponse {
  return {
    reportDatetime: "2026-05-23T10:09:00+09:00",
    publishingOffice: "気象庁",
    headlineText: "強風や高波に注意してください。",
    areaTypes: [
      {
        areas: [
          { code: "1310100", warnings: [{ status: "発表警報・注意報はなし" }] },
        ],
      },
      {
        areas: [
          {
            code: args.areaCode ?? "1310800",
            warnings: args.warnings ?? [{ status: "発表警報・注意報はなし" }],
          },
        ],
      },
    ],
  };
}

describe("extractAreaWarnings", () => {
  it("returns an empty list when the area is explicitly clear", () => {
    const result = extractAreaWarnings(buildPayload({}), "1310800");
    expect(result.warnings).toEqual([]);
    expect(result.topTier).toBeNull();
  });

  it("drops entries marked 解除", () => {
    const result = extractAreaWarnings(
      buildPayload({ warnings: [{ code: "15", status: "解除" }] }),
      "1310800",
    );
    expect(result.warnings).toEqual([]);
    expect(result.topTier).toBeNull();
  });

  it("normalises a single advisory entry", () => {
    const result = extractAreaWarnings(
      buildPayload({ warnings: [{ code: "15", status: "継続" }] }),
      "1310800",
    );
    expect(result.warnings).toEqual([
      { code: "15", label: "強風注意報", tier: "advisory", status: "継続" },
    ]);
    expect(result.topTier).toBe("advisory");
  });

  it("sorts mixed tiers with the severest first", () => {
    const result = extractAreaWarnings(
      buildPayload({
        warnings: [
          { code: "15", status: "発表" }, // 強風注意報
          { code: "33", status: "発表" }, // 大雨特別警報
          { code: "03", status: "発表" }, // 大雨警報
        ],
      }),
      "1310800",
    );
    expect(result.warnings.map((w) => w.tier)).toEqual([
      "special",
      "warning",
      "advisory",
    ]);
    expect(result.topTier).toBe("special");
  });

  it("treats an unknown code as advisory without dropping it", () => {
    const result = extractAreaWarnings(
      buildPayload({ warnings: [{ code: "99", status: "発表" }] }),
      "1310800",
    );
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.label).toBe("コード 99");
    expect(result.topTier).toBe("advisory");
  });

  it("returns a clear result when the area is not in the payload", () => {
    const result = extractAreaWarnings(buildPayload({}), "9999999");
    expect(result.warnings).toEqual([]);
    expect(result.topTier).toBeNull();
    expect(result.reportDatetime).toBe("2026-05-23T10:09:00+09:00");
  });
});
