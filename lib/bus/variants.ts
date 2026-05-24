import type {
  DirectionVariant,
  ServiceCategory,
} from "@/lib/opendata/schemas/bus";

// A variant that only runs on a single service category. Used to flag
// saturday- or sunday-only routes in the UI so visitors don't pick
// the wrong bus on a workday. `null` means the variant runs on more
// than one category (or none at all — defensive fallback).
export type VariantDayRestriction = ServiceCategory | null;

export function variantRestriction(
  v: DirectionVariant,
): VariantDayRestriction {
  const served: ServiceCategory[] = [];
  if (v.schedule.weekday.length > 0) served.push("weekday");
  if (v.schedule.saturday.length > 0) served.push("saturday");
  if (v.schedule.sunday.length > 0) served.push("sunday");
  return served.length === 1 ? (served[0] ?? null) : null;
}

// Produce a display label for a variant that's guaranteed unique among
// the direction's variants. When a single variant carries a headsign,
// the raw headsign is returned as-is; when several variants share it,
// the function tries to disambiguate by stop count first (the most
// meaningful axis for a rider — longer route serves more stops), and
// falls back to a `(経路N)` index when even the stop count collides.
// Used by both the route page and the stop detail page so picker tabs
// and per-time chips always read the same way.
export function disambiguatedHeadsign(
  variant: DirectionVariant,
  allVariants: readonly DirectionVariant[],
): string {
  const sameHeadsign = allVariants.filter(
    (v) => v.headsign === variant.headsign,
  );
  if (sameHeadsign.length <= 1) return variant.headsign;

  const stopCounts = sameHeadsign.map((v) => v.stopSequence.length);
  const stopCountsUnique = new Set(stopCounts).size === stopCounts.length;
  if (stopCountsUnique) {
    return `${variant.headsign} (${variant.stopSequence.length}駅)`;
  }

  // Final fallback: order index within the same-headsign group. 1-based
  // so visitors see "経路1 / 経路2 / …" rather than zero-indexed.
  const idx =
    sameHeadsign.findIndex((v) => v.variantId === variant.variantId) + 1;
  return `${variant.headsign} (経路${idx})`;
}
