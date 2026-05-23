// Persists MapFilters between visits so a 区民 who already picked the
// layers they care about doesn't have to re-toggle them next time.
//
// URL params (`?layers=...`) still win — this only kicks in when the URL
// is silent about layer selection. SSR-safe: every accessor early-returns
// when `window` is undefined.

import { z } from "zod";
import { isBrowser } from "@/lib/ssr";
import { isLayerId, type LayerId } from "./registry";
import type { MapFilters } from "./types";

const STORAGE_KEY = "map_filters_v1";

const StoredFiltersSchema = z.object({
  version: z.literal(1),
  // Record keyed by raw string so an unknown LayerId (added or removed in
  // a later release) parses without rejection — we filter to known ids
  // on load instead.
  layers: z.record(z.string(), z.boolean()).optional(),
  barrierFreeOnly: z.boolean(),
  twentyFourOnly: z.boolean(),
  radius: z.union([
    z.literal(500),
    z.literal(1000),
    z.literal(2000),
    z.null(),
  ]),
});

export function loadMapFilters(): MapFilters | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) return null;
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = StoredFiltersSchema.safeParse(json);
    if (!parsed.success) return null;
    const layers: Partial<Record<LayerId, boolean>> = {};
    if (parsed.data.layers) {
      for (const [k, v] of Object.entries(parsed.data.layers)) {
        if (isLayerId(k)) layers[k] = v;
      }
    }
    return {
      layers,
      barrierFreeOnly: parsed.data.barrierFreeOnly,
      twentyFourOnly: parsed.data.twentyFourOnly,
      radius: parsed.data.radius,
    };
  } catch {
    return null;
  }
}

export function saveMapFilters(filters: MapFilters): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        layers: filters.layers,
        barrierFreeOnly: filters.barrierFreeOnly,
        twentyFourOnly: filters.twentyFourOnly,
        radius: filters.radius,
      }),
    );
  } catch {
    // Quota exceeded or privacy mode — silent failure is fine; the
    // filters still work for the current session.
  }
}
