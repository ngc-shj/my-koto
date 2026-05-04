import { z } from "zod";
import type { Bbox } from "@/config/geo";
import type { MapPoint, PointType } from "@/lib/map/types";

// Read-only OSM Overpass instance. Hostname must remain in
// `config/proxy-allowlist.ts` UPSTREAM_HOSTS.overpass for the proxy route
// to permit the upstream call.
export const OVERPASS_HOST = "overpass-api.de";
export const OVERPASS_URL = `https://${OVERPASS_HOST}/api/interpreter`;

// Restrict the dynamic POI lookup to the same two categories the bundled
// dataset covers — aed and toilet.
const TYPE_TO_FILTER: Record<PointType, string[]> = {
  // emergency=defibrillator (preferred) plus the older healthcare=defibrillator
  // tag still seen in some Japanese mappings.
  aed: [
    'node["emergency"="defibrillator"]',
    'node["healthcare"="defibrillator"]',
  ],
  toilet: ['node["amenity"="toilets"]'],
};

export function buildOverpassQuery(bbox: Bbox, types: readonly PointType[]): string {
  if (types.length === 0) {
    throw new Error("buildOverpassQuery: at least one type is required");
  }
  const bboxClause = `(${bbox.south},${bbox.west},${bbox.north},${bbox.east})`;
  const filters = types
    .flatMap((t) => TYPE_TO_FILTER[t])
    .map((f) => `${f}${bboxClause};`)
    .join("");
  return `[out:json][timeout:25];(${filters});out tags center;`;
}

// Subset of the Overpass JSON shape we actually consume. Tags are intentionally
// loose — tag schemas drift across the OSM ecosystem.
export const OverpassElementSchema = z.object({
  type: z.literal("node"),
  id: z.number(),
  lat: z.number(),
  lon: z.number(),
  tags: z.record(z.string(), z.string()).optional(),
});

export const OverpassResponseSchema = z.object({
  version: z.number().optional(),
  generator: z.string().optional(),
  elements: z.array(OverpassElementSchema),
});

export type OverpassElement = z.infer<typeof OverpassElementSchema>;

function classify(tags: Record<string, string> | undefined): PointType | null {
  if (!tags) return null;
  if (tags.emergency === "defibrillator") return "aed";
  if (tags.healthcare === "defibrillator") return "aed";
  if (tags.amenity === "toilets") return "toilet";
  return null;
}

function pickName(tags: Record<string, string> | undefined, type: PointType): string {
  if (!tags) return type === "aed" ? "AED" : "公衆トイレ";
  return (
    tags["name:ja"] ??
    tags.name ??
    tags["operator:ja"] ??
    tags.operator ??
    tags.description ??
    (type === "aed" ? "AED" : "公衆トイレ")
  );
}

function pickAddress(tags: Record<string, string> | undefined): string {
  if (!tags) return "";
  // Compose Japanese-style address when present; otherwise leave blank.
  const parts: string[] = [];
  if (tags["addr:province"]) parts.push(tags["addr:province"]);
  if (tags["addr:city"]) parts.push(tags["addr:city"]);
  if (tags["addr:quarter"]) parts.push(tags["addr:quarter"]);
  if (tags["addr:neighbourhood"]) parts.push(tags["addr:neighbourhood"]);
  if (tags["addr:block_number"]) parts.push(tags["addr:block_number"]);
  if (tags["addr:housenumber"]) parts.push(tags["addr:housenumber"]);
  return parts.join("");
}

function pickHours(tags: Record<string, string> | undefined): string | undefined {
  if (!tags) return undefined;
  return tags.opening_hours ?? undefined;
}

function pickAccessibility(
  tags: Record<string, string> | undefined,
): MapPoint["accessibility"] | undefined {
  if (!tags) return undefined;
  const wheelchair = tags.wheelchair === "yes" || tags.wheelchair === "designated";
  const twentyFour = tags.opening_hours === "24/7";
  if (!wheelchair && !twentyFour) return undefined;
  return {
    barrier_free: wheelchair,
    twenty_four_hour: twentyFour,
  };
}

export function elementsToMapPoints(elements: OverpassElement[]): MapPoint[] {
  const out: MapPoint[] = [];
  for (const el of elements) {
    const type = classify(el.tags);
    if (type === null) continue;
    out.push({
      id: `osm-${el.id}`,
      type,
      source: "osm",
      name: pickName(el.tags, type),
      address: pickAddress(el.tags),
      lat: el.lat,
      lng: el.lon,
      hours: pickHours(el.tags),
      accessibility: pickAccessibility(el.tags),
    });
  }
  return out;
}
