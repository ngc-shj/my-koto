import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeAed,
  normalizeToilet,
  normalizeWbgtReading,
  normalizeWeather,
} from "./normalize";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("normalizeAed", () => {
  it("returns normalized AED for valid in-bounds record", () => {
    const result = normalizeAed({
      名称: "亀戸文化センター",
      住所: "東京都江東区亀戸2-19-1",
      緯度: "35.696",
      経度: "139.834",
      設置場所詳細: "1階ロビー",
      利用可能時間: "9:00-21:00",
    });

    expect(result).not.toBeNull();
    expect(result?.name).toBe("亀戸文化センター");
    expect(result?.lat).toBe(35.696);
    expect(result?.lng).toBe(139.834);
    expect(result?.locationDetail).toBe("1階ロビー");
  });

  it("returns null for coordinates outside Koto bounds", () => {
    const result = normalizeAed({
      名称: "場外施設",
      住所: "東京都千代田区",
      緯度: "35.689",
      経度: "139.692",
    });

    expect(result).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null for invalid (non-numeric) coordinates", () => {
    const result = normalizeAed({
      名称: "テスト",
      住所: "テスト住所",
      緯度: "invalid",
      経度: "139.834",
    });

    expect(result).toBeNull();
  });
});

describe("normalizeToilet", () => {
  it("returns normalized toilet for valid in-bounds record", () => {
    const result = normalizeToilet({
      名称: "亀戸公園トイレ",
      住所: "東京都江東区亀戸6丁目",
      緯度: "35.698",
      経度: "139.838",
      バリアフリー: "有",
      二十四時間: "○",
      男性用: "有",
      女性用: "有",
      多目的: "有",
    });

    expect(result).not.toBeNull();
    expect(result?.accessible).toBe(true);
    expect(result?.open24h).toBe(true);
    expect(result?.hasMen).toBe(true);
    expect(result?.hasWomen).toBe(true);
    expect(result?.hasMultipurpose).toBe(true);
  });

  it("returns null for coordinates outside Koto bounds", () => {
    const result = normalizeToilet({
      名称: "場外トイレ",
      住所: "東京都新宿区",
      緯度: "35.689",
      経度: "139.700",
    });

    expect(result).toBeNull();
  });

  it("maps falsy values to false for boolean fields", () => {
    const result = normalizeToilet({
      名称: "テストトイレ",
      住所: "東京都江東区亀戸",
      緯度: "35.696",
      経度: "139.834",
      バリアフリー: "無",
      二十四時間: "×",
    });

    expect(result).not.toBeNull();
    expect(result?.accessible).toBe(false);
    expect(result?.open24h).toBe(false);
  });
});

describe("normalizeWbgtReading", () => {
  it("returns the reading when in range", () => {
    const reading = { station: "東京", datetime: "2026-08-01T05:00:00+09:00", wbgt: 28.5 };
    expect(normalizeWbgtReading(reading)).toEqual(reading);
  });

  it("returns null when wbgt > 50", () => {
    const reading = { station: "東京", datetime: "2026-08-01T05:00:00+09:00", wbgt: 55 };
    expect(normalizeWbgtReading(reading)).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null when wbgt < 0", () => {
    const reading = { station: "東京", datetime: "2026-08-01T05:00:00+09:00", wbgt: -1 };
    expect(normalizeWbgtReading(reading)).toBeNull();
  });

  it("accepts boundary values 0 and 50", () => {
    expect(normalizeWbgtReading({ station: "東京", datetime: "now", wbgt: 0 })).not.toBeNull();
    expect(normalizeWbgtReading({ station: "東京", datetime: "now", wbgt: 50 })).not.toBeNull();
  });
});

describe("normalizeWeather", () => {
  it("returns the response when all values are in range", () => {
    const response = {
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: ["2026-08-01T00:00"],
        temperature_2m: [28.5],
      },
    };

    expect(normalizeWeather(response)).toEqual(response);
  });

  it("returns null when hourly temperature exceeds 50", () => {
    const response = {
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: ["2026-08-01T00:00"],
        temperature_2m: [55],
      },
    };

    expect(normalizeWeather(response)).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns null when daily temperature is below -50", () => {
    const response = {
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      daily: {
        time: ["2026-08-01"],
        temperature_2m_max: [30],
        temperature_2m_min: [-60],
      },
    };

    expect(normalizeWeather(response)).toBeNull();
  });

  it("returns null when coordinates are far from Koto City", () => {
    const response = {
      latitude: 40.0,
      longitude: 135.0,
      timezone: "Asia/Tokyo",
    };

    expect(normalizeWeather(response)).toBeNull();
  });
});
