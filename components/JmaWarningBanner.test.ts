import { describe, it, expect } from "vitest";
import { escalateBannerWarnings } from "./JmaWarningBanner";
import type { AreaWarnings } from "@/lib/jma/normalize";

function makeData(
  warnings: AreaWarnings["warnings"],
): AreaWarnings {
  return {
    reportDatetime: "2026-05-23T10:09:00+09:00",
    headlineText: "",
    publishingOffice: "気象庁",
    areaCode: "1310800",
    warnings,
    topTier: warnings[0]?.tier ?? null,
  };
}

describe("escalateBannerWarnings", () => {
  it("returns null when there are no active warnings", () => {
    expect(escalateBannerWarnings(makeData([]))).toBeNull();
  });

  it("drops 注意報 entries and returns null when only advisories remain", () => {
    const data = makeData([
      { code: "15", label: "強風注意報", tier: "advisory", status: "継続" },
      { code: "16", label: "波浪注意報", tier: "advisory", status: "継続" },
    ]);
    expect(escalateBannerWarnings(data)).toBeNull();
  });

  it("picks warning tier when only warnings are active", () => {
    const data = makeData([
      { code: "03", label: "大雨警報", tier: "warning", status: "発表" },
      { code: "15", label: "強風注意報", tier: "advisory", status: "継続" },
    ]);
    const result = escalateBannerWarnings(data);
    expect(result?.topTier).toBe("warning");
    expect(result?.warnings.map((w) => w.label)).toEqual(["大雨警報"]);
  });

  it("picks special tier when 特別警報 is present", () => {
    const data = makeData([
      { code: "33", label: "大雨特別警報", tier: "special", status: "発表" },
      { code: "03", label: "大雨警報", tier: "warning", status: "発表" },
    ]);
    const result = escalateBannerWarnings(data);
    expect(result?.topTier).toBe("special");
    expect(result?.warnings).toHaveLength(2);
  });
});
