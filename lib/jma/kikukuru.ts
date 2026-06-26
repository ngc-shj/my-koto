import {
  JMA_KIKUKURU_TARGET_TIMES_URL,
  JMA_KIKUKURU_TILE_BASE_URL,
} from "@/config/opendata";
import type { KikukuruElement } from "@/config/hazard-tiles";
import {
  KikukuruTargetTimesSchema,
  type KikukuruTargetTime,
} from "@/lib/opendata/schemas/jma-kikukuru";

export type KikukuruFrame = {
  readonly basetime: string;
  readonly validtime: string;
  readonly member: string;
};

// Pick the frame to render. The `none` member rows are the confirmed (not
// preliminary) analysis; `immed0..2` are fast-but-tentative nowcast frames
// that can shift. We render the latest confirmed frame, falling back to the
// newest row of any member so the overlay still works if the feed ever drops
// the `none` rows. targetTimes.json is ordered newest-first, so the first
// match wins.
export function pickLatestKikukuru(
  entries: readonly KikukuruTargetTime[],
): KikukuruFrame | null {
  const confirmed = entries.find((e) => e.member === "none");
  const chosen = confirmed ?? entries[0];
  if (chosen == null) return null;
  return {
    basetime: chosen.basetime,
    validtime: chosen.validtime,
    member: chosen.member,
  };
}

// Build the `{z}/{x}/{y}` tile URL template for a resolved frame + risk
// surface, e.g.
//   {base}/{basetime}/{member}/{validtime}/surf/{element}/{z}/{x}/{y}.png
// The `{z}/{x}/{y}` placeholders are left intact for MapLibre to fill.
export function buildKikukuruTileUrl(
  frame: KikukuruFrame,
  element: KikukuruElement,
): string {
  return (
    `${JMA_KIKUKURU_TILE_BASE_URL}/${frame.basetime}/${frame.member}` +
    `/${frame.validtime}/surf/${element}/{z}/{x}/{y}.png`
  );
}

// Client-side fetch of the targetTimes index, validated against the schema.
// Returns null on any failure (network / shape) so the caller can simply skip
// the キキクル overlays without throwing — the basemap and other layers must
// stay usable.
export async function fetchKikukuruFrame(
  signal?: AbortSignal,
): Promise<KikukuruFrame | null> {
  try {
    const res = await fetch(JMA_KIKUKURU_TARGET_TIMES_URL, { signal });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    const parsed = KikukuruTargetTimesSchema.safeParse(raw);
    if (!parsed.success) return null;
    return pickLatestKikukuru(parsed.data);
  } catch {
    return null;
  }
}
