// Persists the OSM POI set fetched from /api/pois so layer chip counts
// can render immediately on revisit instead of waiting for the first
// network round-trip. The map merges these alongside bundled points by
// id, so a stale cached row is harmless — the next fetch overwrites it.

import { z } from "zod";
import { isBrowser } from "@/lib/ssr";
import { isLayerId } from "./registry";
import type { MapPoint } from "./types";

const STORAGE_KEY = "map_pois_v1";
// 7 days. Long enough for typical revisit cadence; short enough that
// OSM edits land within a week even if the viewport never moves.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Cap so a heavy-panning user can't blow past localStorage's ~5MB quota.
const MAX_POINTS = 5000;

const MapPointSchema = z.object({
  id: z.string(),
  type: z.string(),
  source: z.enum(["koto-official", "tokyo-met", "osm"]).optional(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  detail: z.string().optional(),
  hours: z.string().optional(),
  phone: z.string().optional(),
  note: z.string().optional(),
  facilityType: z.string().optional(),
  accessibility: z
    .object({
      barrier_free: z.boolean(),
      twenty_four_hour: z.boolean(),
    })
    .optional(),
});

const EnvelopeSchema = z.object({
  version: z.literal(1),
  storedAt: z.number(),
  points: z.array(MapPointSchema),
});

export function loadCachedPois(): MapPoint[] | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) return null;
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = EnvelopeSchema.safeParse(json);
    if (!parsed.success) return null;
    if (Date.now() - parsed.data.storedAt > TTL_MS) return null;
    // Drop rows whose type no longer matches a known layer (registry change).
    return parsed.data.points.filter((p) => isLayerId(p.type)) as MapPoint[];
  } catch {
    return null;
  }
}

export function saveCachedPois(points: readonly MapPoint[]): void {
  if (!isBrowser()) return;
  const capped =
    points.length > MAX_POINTS ? points.slice(-MAX_POINTS) : points;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        storedAt: Date.now(),
        points: capped,
      }),
    );
  } catch {
    // Quota or private mode — fall back to in-memory only.
  }
}

export function clearCachedPois(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
