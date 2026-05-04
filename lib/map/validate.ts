import { AedResponseSchema } from "@/lib/opendata/schemas/aed";
import { ToiletResponseSchema } from "@/lib/opendata/schemas/toilet";
import { ShelterResponseSchema } from "@/lib/opendata/schemas/shelter";
import { AssemblyPointResponseSchema } from "@/lib/opendata/schemas/assembly-point";
import { WaterSupplyResponseSchema } from "@/lib/opendata/schemas/water-supply";
import { KotoFacilityResponseSchema } from "@/lib/opendata/schemas/koto-facility";
import {
  normalizeAed,
  normalizeAssemblyPoint,
  normalizeKotoFacility,
  normalizeShelter,
  normalizeToilet,
  normalizeWaterSupply,
} from "./normalize";
import type { MapPoint, PointType } from "./types";

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

// Parses bundled Koto-ku facility data (公園・図書館・児童館・保育園) using
// the shared 38列 schema. Pass the layer id so the resulting points carry
// the right `type` discriminator.
export function parseKotoFacilityData(
  kind: Extract<PointType, "park" | "library" | "child_center" | "nursery">,
  raw: unknown,
): MapPoint[] {
  const parsed = KotoFacilityResponseSchema.parse(raw);
  return parsed.result.records.map((rec, i) =>
    normalizeKotoFacility(kind, rec, i),
  );
}
