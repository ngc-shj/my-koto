import type { AedRecord } from "@/lib/opendata/schemas/aed";
import type { ToiletRecord } from "@/lib/opendata/schemas/toilet";
import type { MapPoint } from "./types";

// Truthy check for Japanese "有" / "○" values
function isTruthy(val: string | undefined): boolean {
  return val === "有" || val === "○";
}

export function normalizeAed(record: AedRecord, index: number): MapPoint {
  return {
    id: `aed-${index}`,
    type: "aed",
    name: record.名称,
    address: record.住所,
    lat: parseFloat(record.緯度),
    lng: parseFloat(record.経度),
    detail: record.設置場所詳細,
    hours: record.利用可能時間,
    phone: record.電話番号,
    note: record.備考,
  };
}

export function normalizeToilet(record: ToiletRecord, index: number): MapPoint {
  return {
    id: `toilet-${index}`,
    type: "toilet",
    name: record.名称,
    address: record.住所,
    lat: parseFloat(record.緯度),
    lng: parseFloat(record.経度),
    note: record.備考,
    accessibility: {
      barrier_free: isTruthy(record.バリアフリー),
      twenty_four_hour: isTruthy(record.二十四時間),
    },
  };
}
