import { describe, it, expect } from "vitest";
import { pickLatestKikukuru, buildKikukuruTileUrl } from "./kikukuru";
import type { KikukuruTargetTime } from "@/lib/opendata/schemas/jma-kikukuru";

function frame(
  basetime: string,
  member: string,
  validtime = basetime,
): KikukuruTargetTime {
  return { basetime, validtime, member };
}

describe("pickLatestKikukuru", () => {
  it("returns null for an empty list", () => {
    expect(pickLatestKikukuru([])).toBeNull();
  });

  it("prefers the confirmed (member=none) row over preliminary immed rows", () => {
    const entries = [
      frame("20260626112000", "immed0"),
      frame("20260626111000", "immed1"),
      frame("20260626105000", "none"),
    ];
    const result = pickLatestKikukuru(entries);
    expect(result?.member).toBe("none");
    expect(result?.basetime).toBe("20260626105000");
  });

  it("falls back to the newest row when no confirmed frame exists", () => {
    const entries = [
      frame("20260626112000", "immed0"),
      frame("20260626111000", "immed1"),
    ];
    const result = pickLatestKikukuru(entries);
    expect(result?.basetime).toBe("20260626112000");
    expect(result?.member).toBe("immed0");
  });
});

describe("buildKikukuruTileUrl", () => {
  const sel = {
    basetime: "20260626105000",
    validtime: "20260626105000",
    member: "none",
  };

  it("builds the inund surface URL with {z}/{x}/{y} placeholders intact", () => {
    const url = buildKikukuruTileUrl(sel, "inund");
    expect(url).toBe(
      "https://www.jma.go.jp/bosai/jmatile/data/risk/20260626105000/none/20260626105000/surf/inund/{z}/{x}/{y}.png",
    );
  });

  it("varies the surface element in the path", () => {
    expect(buildKikukuruTileUrl(sel, "land")).toContain("/surf/land/");
    expect(buildKikukuruTileUrl(sel, "flood")).toContain("/surf/flood/");
  });
});
