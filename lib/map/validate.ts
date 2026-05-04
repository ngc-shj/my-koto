import { AedResponseSchema } from "@/lib/opendata/schemas/aed";
import { ToiletResponseSchema } from "@/lib/opendata/schemas/toilet";
import { normalizeAed, normalizeToilet } from "./normalize";
import type { MapPoint } from "./types";

// Parses and validates raw JSON from data/aed.json, returns normalized MapPoints.
// Throws ZodError if the data does not match the expected schema.
export function parseAedData(raw: unknown): MapPoint[] {
  const parsed = AedResponseSchema.parse(raw);
  return parsed.result.records.map(normalizeAed);
}

// Parses and validates raw JSON from data/toilet.json, returns normalized MapPoints.
export function parseToiletData(raw: unknown): MapPoint[] {
  const parsed = ToiletResponseSchema.parse(raw);
  return parsed.result.records.map(normalizeToilet);
}
