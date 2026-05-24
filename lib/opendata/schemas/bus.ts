import { z } from "zod";

// "HH:MM" or "HH:MM:SS" — hours may exceed 23 (GTFS service-day convention).
// We keep the original token so callers can decide whether to render as
// "翌1:30" or fold it back into a 24h clock.
const BUS_TIME_RE = /^([0-9]{1,2}):([0-5][0-9])(?::([0-5][0-9]))?$/;
export const BusTimeSchema = z
  .string()
  .regex(BUS_TIME_RE, "expected HH:MM or HH:MM:SS, hours may be >= 24");

export const BusStopSchema = z.object({
  stopId: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

const ServiceCategoryEnum = z.enum(["weekday", "saturday", "sunday"]);
export type ServiceCategory = z.infer<typeof ServiceCategoryEnum>;

const StopDeparturesSchema = z.object({
  stopId: z.string().min(1),
  times: z.array(BusTimeSchema).readonly(),
});

// [lng, lat] tuple matching MapLibre's GeoJSON ordering. We do not type
// this as `readonly` on the tuple level because the fetch script reads
// GTFS shapes into mutable arrays and the rendered output is a
// straight passthrough.
const ShapePointSchema = z
  .tuple([z.number().gte(-180).lte(180), z.number().gte(-90).lte(90)]);

const ScheduleSchema = z.object({
  weekday: z.array(StopDeparturesSchema).readonly(),
  saturday: z.array(StopDeparturesSchema).readonly(),
  sunday: z.array(StopDeparturesSchema).readonly(),
});

// One concrete route variant within a direction. A direction's merged
// view (DirectionPattern.stopSequence / headsign / schedule) folds every
// variant together, which is fine for a high-level "all trips at this
// stop" listing but actively misleading on the route page where users
// reasonably expect the stop list to match the headsign and the shape.
// Variants carry the per-shape-pattern truth so the UI can stop lying.
const VariantSchema = z.object({
  // Stable id within the parent direction — generated as `v0`, `v1`, ...
  // sorted by tripCount desc so `v0` is always the most-used variant.
  variantId: z.string().min(1),
  headsign: z.string().min(1),
  stopSequence: z.array(z.string().min(1)).readonly(),
  // Distinct GTFS shape_ids backing this variant. Most variants have
  // exactly one; routes with construction-era detours can have several
  // sharing one stop pattern.
  shapes: z.array(z.array(ShapePointSchema).readonly()).readonly().optional(),
  schedule: ScheduleSchema,
  // How many trips collapsed into this variant. Used to sort the
  // picker tabs and to tag low-frequency variants for the UI.
  tripCount: z.number().int().nonnegative(),
});

const DirectionPatternSchema = z.object({
  directionId: z.enum(["0", "1"]),
  headsign: z.string().min(1),
  stopSequence: z.array(z.string().min(1)).readonly(),
  // Optional road-following geometry sourced from GTFS shapes.txt — when
  // present the map draws this polyline; when absent (older bundles or
  // routes whose trips referenced no shape) the renderer falls back to
  // connecting stops in order. Kept for back-compat with bundles that
  // pre-date the multi-shape `shapes` field below.
  shape: z.array(ShapePointSchema).readonly().optional(),
  // Multi-variant geometry: a route+direction may have several
  // shape_ids in GTFS (different terminals, branch detours, etc).
  // Picking only the most-used one (the prior `shape` field) leaves
  // visible gaps where the other variants run. We carry every shape
  // referenced by surviving trips so the renderer can draw them all.
  shapes: z.array(z.array(ShapePointSchema).readonly()).readonly().optional(),
  schedule: ScheduleSchema,
  // Per-variant breakdown of this direction. Optional for back-compat
  // with bundles produced before the variants pass. When present, the
  // route page exposes a picker so users can drill into individual
  // shape/headsign patterns instead of the merged misleading view.
  variants: z.array(VariantSchema).readonly().optional(),
});

export const BusRouteSchema = z.object({
  routeId: z.string().min(1),
  shortName: z.string().min(1),
  longName: z.string(),
  agencyId: z.string().min(1),
  directions: z.array(DirectionPatternSchema).readonly(),
});

export const BusToeiDataSchema = z.object({
  fetchedAt: z.string().datetime(),
  feedVersion: z.string(),
  source: z.string().url(),
  license: z.object({
    name: z.string(),
    url: z.string().url(),
  }),
  stops: z.record(z.string(), BusStopSchema),
  routes: z.array(BusRouteSchema).readonly(),
});

export type BusStop = z.infer<typeof BusStopSchema>;
export type StopDepartures = z.infer<typeof StopDeparturesSchema>;
export type DirectionVariant = z.infer<typeof VariantSchema>;
export type DirectionPattern = z.infer<typeof DirectionPatternSchema>;
export type BusRoute = z.infer<typeof BusRouteSchema>;
export type BusToeiData = z.infer<typeof BusToeiDataSchema>;
