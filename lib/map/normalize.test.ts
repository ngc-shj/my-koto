import { describe, it, expect } from "vitest";
import {
  normalizeAed,
  normalizeToilet,
  normalizeShelter,
  normalizeAssemblyPoint,
  normalizeKotoFacility,
  normalizeWaterSupply,
} from "./normalize";

// ---------------------------------------------------------------------------
// Minimal record factories — only the fields normalize.ts touches
// ---------------------------------------------------------------------------

function aedRecord(overrides: Record<string, string> = {}) {
  return {
    名称: "テストAED",
    住所: "江東区豊洲1-1-1",
    緯度: "35.6500",
    経度: "139.7900",
    設置場所詳細: "1F受付",
    利用可能時間: "24時間",
    電話番号: "03-0000-0000",
    備考: "",
    ...overrides,
  };
}

function toiletRecord(overrides: Record<string, string | undefined> = {}) {
  return {
    名称: "テストトイレ",
    住所: "江東区東陽1-1-1",
    緯度: "35.6700",
    経度: "139.8100",
    備考: "",
    バリアフリー: undefined as string | undefined,
    二十四時間: undefined as string | undefined,
    ...overrides,
  };
}

function assemblyPointRecord(overrides: Record<string, string | undefined> = {}) {
  return {
    名称: "テスト避難場所",
    住所: "江東区亀戸1-1-1",
    緯度: "35.6950",
    経度: "139.8300",
    備考: "",
    バリアフリー: undefined as string | undefined,
    洪水: undefined as string | undefined,
    崖崩れ: undefined as string | undefined,
    高潮: undefined as string | undefined,
    地震: undefined as string | undefined,
    津波: undefined as string | undefined,
    大規模火災: undefined as string | undefined,
    内水氾濫: undefined as string | undefined,
    火山現象: undefined as string | undefined,
    ...overrides,
  };
}

function kotoFacilityRecord(overrides: Record<string, string | undefined> = {}) {
  return {
    名称: "テスト公園",
    住所: "江東区深川1-1-1",
    緯度: "35.6800",
    経度: "139.7950",
    電話番号: "03-1111-1111",
    利用可能日時特記事項: undefined as string | undefined,
    バリアフリー情報: undefined as string | undefined,
    備考: "",
    ...overrides,
  };
}

function waterSupplyRecord(overrides: Record<string, string | undefined> = {}) {
  return {
    名称: "テスト給水拠点",
    住所: "江東区有明1-1-1",
    緯度: "35.6350",
    経度: "139.7850",
    種別: undefined as string | undefined,
    確保水量: undefined as string | undefined,
    備考: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// isTruthy (tested indirectly via normalizeToilet / normalizeAssemblyPoint)
// ---------------------------------------------------------------------------

describe("isTruthy (via normalizeToilet)", () => {
  it.each([
    ["有", true],
    ["○", true],
    ["1", true],
    ["true", true],
    [" 有 ", true],   // trimmed
    ["無", false],
    ["×", false],
    ["0", false],
    ["false", false],
    ["", false],
    [undefined, false],
  ])("value=%j => barrier_free=%j", (val, expected) => {
    const point = normalizeToilet(toiletRecord({ バリアフリー: val }), 0);
    expect(point.accessibility?.barrier_free).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// normalizeAed
// ---------------------------------------------------------------------------

describe("normalizeAed", () => {
  it("maps fields correctly", () => {
    const point = normalizeAed(aedRecord(), 0);
    expect(point).toMatchObject({
      id: "aed-0",
      type: "aed",
      source: "koto-official",
      name: "テストAED",
      lat: 35.65,
      lng: 139.79,
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeToilet
// ---------------------------------------------------------------------------

describe("normalizeToilet", () => {
  it("sets accessibility flags from Japanese values", () => {
    const point = normalizeToilet(
      toiletRecord({ バリアフリー: "有", 二十四時間: "○" }),
      0,
    );
    expect(point.accessibility).toEqual({
      barrier_free: true,
      twenty_four_hour: true,
    });
  });

  it("sets false for negative values", () => {
    const point = normalizeToilet(
      toiletRecord({ バリアフリー: "無", 二十四時間: "×" }),
      0,
    );
    expect(point.accessibility).toEqual({
      barrier_free: false,
      twenty_four_hour: false,
    });
  });
});

// ---------------------------------------------------------------------------
// normalizeAssemblyPoint — hazard flags
// ---------------------------------------------------------------------------

describe("normalizeAssemblyPoint", () => {
  it("sets hazard flags from truthy values", () => {
    const point = normalizeAssemblyPoint(
      assemblyPointRecord({ 洪水: "有", 地震: "○", 津波: "1" }),
      0,
    );
    expect(point.hazards).toEqual({
      flood: true,
      earthquake: true,
      tsunami: true,
    });
  });

  it("omits hazards when all are falsy", () => {
    const point = normalizeAssemblyPoint(assemblyPointRecord(), 0);
    expect(point.hazards).toBeUndefined();
  });

  it("sets all 8 hazard types", () => {
    const point = normalizeAssemblyPoint(
      assemblyPointRecord({
        洪水: "有",
        崖崩れ: "有",
        高潮: "有",
        地震: "有",
        津波: "有",
        大規模火災: "有",
        内水氾濫: "有",
        火山現象: "有",
      }),
      0,
    );
    expect(Object.keys(point.hazards!)).toHaveLength(8);
  });

  it("includes accessibility when バリアフリー is present", () => {
    const point = normalizeAssemblyPoint(
      assemblyPointRecord({ バリアフリー: "○" }),
      0,
    );
    expect(point.accessibility).toEqual({
      barrier_free: true,
      twenty_four_hour: false,
    });
  });

  it("omits accessibility when バリアフリー is absent", () => {
    const point = normalizeAssemblyPoint(assemblyPointRecord(), 0);
    expect(point.accessibility).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeKotoFacility — barrier-free regex detection
// ---------------------------------------------------------------------------

describe("normalizeKotoFacility", () => {
  it.each([
    ["多目的トイレあり", true],
    ["スロープ設置", true],
    ["車椅子対応", true],
    ["バリアフリー対応", true],
    ["なし", false],
    ["", false],
  ])("バリアフリー情報=%j => barrier_free=%j", (info, expected) => {
    const raw = info || undefined;
    const point = normalizeKotoFacility(
      "park",
      kotoFacilityRecord({ バリアフリー情報: raw }),
      0,
    );
    if (raw) {
      expect(point.accessibility?.barrier_free).toBe(expected);
    } else {
      expect(point.accessibility).toBeUndefined();
    }
  });

  it("sets kind correctly for each facility type", () => {
    for (const kind of ["park", "library", "child_center", "nursery"] as const) {
      const point = normalizeKotoFacility(kind, kotoFacilityRecord(), 0);
      expect(point.type).toBe(kind);
      expect(point.id).toBe(`${kind}-0`);
    }
  });
});

// ---------------------------------------------------------------------------
// normalizeWaterSupply
// ---------------------------------------------------------------------------

describe("normalizeWaterSupply", () => {
  it("composes detail from 種別 and 確保水量", () => {
    const point = normalizeWaterSupply(
      waterSupplyRecord({ 種別: "応急給水槽", 確保水量: "1500" }),
      0,
    );
    expect(point.detail).toBe("応急給水槽 / 確保水量 1500 m³");
  });

  it("omits detail when both fields are empty", () => {
    const point = normalizeWaterSupply(waterSupplyRecord(), 0);
    expect(point.detail).toBeUndefined();
  });
});
