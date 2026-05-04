import type { AedRecord } from "@/lib/opendata/schemas/aed";
import type { ToiletRecord } from "@/lib/opendata/schemas/toilet";
import type { ShelterRecord } from "@/lib/opendata/schemas/shelter";
import type { AssemblyPointRecord } from "@/lib/opendata/schemas/assembly-point";
import type { WaterSupplyRecord } from "@/lib/opendata/schemas/water-supply";
import type { HazardFlags, MapPoint } from "./types";

// Truthy check for Japanese affirmative cell values.
function isTruthy(val: string | undefined): boolean {
  if (val == null) return false;
  const v = val.trim();
  return v === "有" || v === "○" || v === "1" || v === "true";
}

export function normalizeAed(record: AedRecord, index: number): MapPoint {
  return {
    id: `aed-${index}`,
    type: "aed",
    source: "koto-official",
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
    source: "koto-official",
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

export function normalizeShelter(
  record: ShelterRecord,
  index: number,
): MapPoint {
  return {
    id: `shelter-${index}`,
    type: "shelter",
    source: "tokyo-met",
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

export function normalizeAssemblyPoint(
  record: AssemblyPointRecord,
  index: number,
): MapPoint {
  const hazards: HazardFlags = {};
  if (isTruthy(record.洪水)) hazards.flood = true;
  if (isTruthy(record.崖崩れ)) hazards.landslide = true;
  if (isTruthy(record.高潮)) hazards.high_tide = true;
  if (isTruthy(record.地震)) hazards.earthquake = true;
  if (isTruthy(record.津波)) hazards.tsunami = true;
  if (isTruthy(record.大規模火災)) hazards.large_fire = true;
  if (isTruthy(record.内水氾濫)) hazards.internal_flood = true;
  if (isTruthy(record.火山現象)) hazards.volcanic = true;
  return {
    id: `assembly-${index}`,
    type: "assembly_point",
    source: "tokyo-met",
    name: record.名称,
    address: record.住所,
    lat: parseFloat(record.緯度),
    lng: parseFloat(record.経度),
    note: record.備考,
    hazards: Object.keys(hazards).length > 0 ? hazards : undefined,
    accessibility: record.バリアフリー
      ? {
          barrier_free: isTruthy(record.バリアフリー),
          twenty_four_hour: false,
        }
      : undefined,
  };
}

export function normalizeWaterSupply(
  record: WaterSupplyRecord,
  index: number,
): MapPoint {
  // Compose detail line: 種別 (and capacity when present).
  const detailParts: string[] = [];
  if (record.種別) detailParts.push(record.種別);
  if (record.確保水量) detailParts.push(`確保水量 ${record.確保水量} m³`);
  return {
    id: `water-${index}`,
    type: "water_supply",
    source: "tokyo-met",
    name: record.名称,
    address: record.住所,
    lat: parseFloat(record.緯度),
    lng: parseFloat(record.経度),
    facilityType: record.種別,
    detail: detailParts.length > 0 ? detailParts.join(" / ") : undefined,
    note: record.備考,
  };
}
