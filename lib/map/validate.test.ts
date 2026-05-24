import { describe, it, expect } from "vitest";
import {
  parseAedData,
  parseAssemblyPointData,
  parseKotoFacilityData,
  parseShelterData,
  parseToiletData,
  parseWaterSupplyData,
} from "./validate";
// AED and Toilet inline fixtures — the real source now lives behind
// `/api/datasets/{aed,toilet}` (CKAN-resolved CSV), so bulk validation
// here switched to synthetic records that still exercise every column
// the parser reads.
const aedFixture = {
  result: {
    records: [
      {
        名称: "有明西学園",
        住所: "東京都江東区有明1-7-13",
        緯度: "35.637038",
        経度: "139.784381",
        設置場所詳細: "1階昇降口",
        利用可能時間: "8:00-16:00",
        電話番号: "(03)3527-6401",
        備考: "学校開庁日",
      },
      {
        名称: "豊洲シビックセンター",
        住所: "東京都江東区豊洲2-2-18",
        緯度: "35.654",
        経度: "139.795",
      },
    ],
  },
};
const toiletFixture = {
  result: {
    records: [
      {
        名称: "豊洲公園トイレ",
        住所: "東京都江東区豊洲2-3-6",
        緯度: "35.654",
        経度: "139.795",
        バリアフリー: "有",
        二十四時間: "",
        多目的: "有",
      },
      {
        名称: "夢の島公園トイレ",
        住所: "東京都江東区夢の島",
        緯度: "35.65",
        経度: "139.82",
        男性用: "有",
        女性用: "有",
      },
    ],
  },
};
import shelterFixture from "@/data/shelter.json";
import assemblyPointFixture from "@/data/assembly_point.json";
import waterSupplyFixture from "@/data/water_supply.json";
import parkFixture from "@/data/park.json";
import libraryFixture from "@/data/library.json";
import childCenterFixture from "@/data/child_center.json";
import nurseryFixture from "@/data/nursery.json";

describe("parseAedData", () => {
  it("validates and normalizes synthetic AED records", () => {
    const points = parseAedData(aedFixture);
    expect(points).toHaveLength(2);
    for (const p of points) {
      expect(p.type).toBe("aed");
      expect(typeof p.lat).toBe("number");
      expect(typeof p.lng).toBe("number");
      expect(p.name).toBeTruthy();
      expect(p.address).toBeTruthy();
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
  it("validates and normalizes synthetic toilet records", () => {
    const points = parseToiletData(toiletFixture);
    expect(points).toHaveLength(2);
    for (const p of points) {
      expect(p.type).toBe("toilet");
      expect(typeof p.lat).toBe("number");
      expect(typeof p.lng).toBe("number");
      expect(p.accessibility).toBeDefined();
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

describe("parseKotoFacilityData", () => {
  it.each([
    ["park", parkFixture],
    ["library", libraryFixture],
    ["child_center", childCenterFixture],
    ["nursery", nurseryFixture],
  ] as const)(
    "validates and normalizes the bundled %s fixture",
    (kind, fixture) => {
      const points = parseKotoFacilityData(kind, fixture);
      expect(points.length).toBeGreaterThan(0);
      for (const p of points) {
        expect(p.type).toBe(kind);
        expect(p.source).toBe("koto-official");
        expect(p.lat).toBeGreaterThan(35.5);
        expect(p.lat).toBeLessThan(35.8);
      }
    },
  );

  it("derives barrier_free=true when accessibility text mentions multi-purpose toilet", () => {
    const raw = {
      result: {
        records: [
          {
            名称: "テスト児童館",
            住所: "東京都江東区",
            緯度: "35.67",
            経度: "139.81",
            バリアフリー情報: "多目的トイレ有り;スロープ有り",
          },
        ],
      },
    };
    const [point] = parseKotoFacilityData("child_center", raw);
    expect(point.accessibility?.barrier_free).toBe(true);
  });

  it("leaves accessibility undefined when the field is empty", () => {
    const raw = {
      result: {
        records: [
          {
            名称: "テスト公園",
            住所: "東京都江東区",
            緯度: "35.67",
            経度: "139.81",
          },
        ],
      },
    };
    const [point] = parseKotoFacilityData("park", raw);
    expect(point.accessibility).toBeUndefined();
  });
});
