import { describe, it, expect } from "vitest";
import {
  parseAedData,
  parseAssemblyPointData,
  parseShelterData,
  parseToiletData,
  parseWaterSupplyData,
} from "./validate";
import aedFixture from "@/data/aed.json";
import toiletFixture from "@/data/toilet.json";
import shelterFixture from "@/data/shelter.json";
import assemblyPointFixture from "@/data/assembly_point.json";
import waterSupplyFixture from "@/data/water_supply.json";

describe("parseAedData", () => {
  it("validates and normalizes the official aed.json fixture", () => {
    const points = parseAedData(aedFixture);
    // The upstream Koto-ku open data CSV currently exposes ~246 AED sites;
    // assert a non-trivial count rather than a magic number so a refresh
    // doesn't break the test on every upstream update.
    expect(points.length).toBeGreaterThan(50);
    expect(points[0].type).toBe("aed");
    expect(typeof points[0].lat).toBe("number");
    expect(typeof points[0].lng).toBe("number");
    expect(points[0].name).toBeTruthy();
    expect(points[0].address).toBeTruthy();
    // Sanity-check coordinates land inside Koto-ku's bounding envelope.
    for (const p of points) {
      expect(p.lat).toBeGreaterThan(35.5);
      expect(p.lat).toBeLessThan(35.8);
      expect(p.lng).toBeGreaterThan(139.7);
      expect(p.lng).toBeLessThan(139.9);
    }
  });

  it("throws on invalid aed data", () => {
    expect(() =>
      parseAedData({ result: { records: [{ 住所: "test" }] } })
    ).toThrow();
  });
});

describe("parseToiletData", () => {
  it("validates and normalizes the official toilet.json fixture", () => {
    const points = parseToiletData(toiletFixture);
    expect(points.length).toBeGreaterThan(50);
    expect(points[0].type).toBe("toilet");
    expect(typeof points[0].lat).toBe("number");
    expect(typeof points[0].lng).toBe("number");
    expect(points[0].accessibility).toBeDefined();
    for (const p of points) {
      expect(p.lat).toBeGreaterThan(35.5);
      expect(p.lat).toBeLessThan(35.8);
      expect(p.lng).toBeGreaterThan(139.7);
      expect(p.lng).toBeLessThan(139.9);
    }
  });

  it("throws on invalid toilet data", () => {
    expect(() =>
      parseToiletData({ result: { records: [{ 住所: "test" }] } })
    ).toThrow();
  });

  it("maps 有/○ to boolean accessibility flags", () => {
    const raw = {
      result: {
        records: [
          {
            名称: "テスト",
            住所: "東京都江東区",
            緯度: "35.67",
            経度: "139.81",
            バリアフリー: "有",
            二十四時間: "○",
          },
        ],
      },
    };
    const points = parseToiletData(raw);
    expect(points[0].accessibility?.barrier_free).toBe(true);
    expect(points[0].accessibility?.twenty_four_hour).toBe(true);
  });

  it("maps non-有/○ to false accessibility flags", () => {
    const raw = {
      result: {
        records: [
          {
            名称: "テスト",
            住所: "東京都江東区",
            緯度: "35.67",
            経度: "139.81",
            バリアフリー: "無",
            二十四時間: "×",
          },
        ],
      },
    };
    const points = parseToiletData(raw);
    expect(points[0].accessibility?.barrier_free).toBe(false);
    expect(points[0].accessibility?.twenty_four_hour).toBe(false);
  });
});

describe("parseShelterData", () => {
  it("validates and normalizes the bundled shelter fixture", () => {
    const points = parseShelterData(shelterFixture);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.type).toBe("shelter");
      expect(p.source).toBe("tokyo-met");
      expect(p.lat).toBeGreaterThan(35.5);
      expect(p.lat).toBeLessThan(35.8);
      expect(p.lng).toBeGreaterThan(139.7);
      expect(p.lng).toBeLessThan(139.9);
    }
  });
});

describe("parseAssemblyPointData", () => {
  it("validates and normalizes the bundled assembly point fixture", () => {
    const points = parseAssemblyPointData(assemblyPointFixture);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.type).toBe("assembly_point");
      expect(p.source).toBe("tokyo-met");
    }
  });

  it("converts hazard flags ('1' string) into boolean hazards", () => {
    const raw = {
      result: {
        records: [
          {
            名称: "テスト避難場所",
            住所: "東京都江東区",
            緯度: "35.67",
            経度: "139.81",
            洪水: "1",
            高潮: "1",
            地震: "",
            津波: "1",
            大規模火災: "0",
            内水氾濫: "1",
          },
        ],
      },
    };
    const [point] = parseAssemblyPointData(raw);
    expect(point.hazards).toEqual({
      flood: true,
      high_tide: true,
      tsunami: true,
      internal_flood: true,
    });
  });
});

describe("parseWaterSupplyData", () => {
  it("validates and normalizes the bundled water supply fixture", () => {
    const points = parseWaterSupplyData(waterSupplyFixture);
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.type).toBe("water_supply");
      expect(p.source).toBe("tokyo-met");
    }
  });

  it("composes a detail string from 種別 + 確保水量", () => {
    const raw = {
      result: {
        records: [
          {
            名称: "亀戸給水所",
            住所: "東京都江東区亀戸2-6-50",
            緯度: "35.7",
            経度: "139.82",
            種別: "浄水場・給水所",
            確保水量: "20000",
          },
        ],
      },
    };
    const [point] = parseWaterSupplyData(raw);
    expect(point.facilityType).toBe("浄水場・給水所");
    expect(point.detail).toContain("浄水場・給水所");
    expect(point.detail).toContain("20000");
  });
});
