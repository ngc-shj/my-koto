import { AedResponseSchema } from "@/lib/opendata/schemas/aed";
import { ToiletResponseSchema } from "@/lib/opendata/schemas/toilet";
import { ShelterResponseSchema } from "@/lib/opendata/schemas/shelter";
import { AssemblyPointResponseSchema } from "@/lib/opendata/schemas/assembly-point";
import { WaterSupplyResponseSchema } from "@/lib/opendata/schemas/water-supply";
import {
  normalizeAed,
  normalizeAssemblyPoint,
  normalizeShelter,
  normalizeToilet,
  normalizeWaterSupply,
} from "./normalize";
import type { MapPoint } from "./types";

// Each parser validates an envelope-shaped JSON file (`{ result: { records: [...] } }`)
// then maps every record to a `MapPoint`. Raw JSON imports come from
// data/<layer>.json. Throws ZodError on schema mismatch.

export function parseAedData(raw: unknown): MapPoint[] {
  const parsed = AedResponseSchema.parse(raw);
  return parsed.result.records.map(normalizeAed);
}

export function parseToiletData(raw: unknown): MapPoint[] {
  const parsed = ToiletResponseSchema.parse(raw);
  return parsed.result.records.map(normalizeToilet);
}

export function parseShelterData(raw: unknown): MapPoint[] {
  const parsed = ShelterResponseSchema.parse(raw);
  return parsed.result.records.map(normalizeShelter);
}

export function parseAssemblyPointData(raw: unknown): MapPoint[] {
  const parsed = AssemblyPointResponseSchema.parse(raw);
  return parsed.result.records.map(normalizeAssemblyPoint);
}

export function parseWaterSupplyData(raw: unknown): MapPoint[] {
  const parsed = WaterSupplyResponseSchema.parse(raw);
  return parsed.result.records.map(normalizeWaterSupply);
}
