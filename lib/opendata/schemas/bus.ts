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

const DirectionPatternSchema = z.object({
  directionId: z.enum(["0", "1"]),
  headsign: z.string().min(1),
  stopSequence: z.array(z.string().min(1)).readonly(),
  schedule: z.object({
    weekday: z.array(StopDeparturesSchema).readonly(),
    saturday: z.array(StopDeparturesSchema).readonly(),
    sunday: z.array(StopDeparturesSchema).readonly(),
  }),
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
export type DirectionPattern = z.infer<typeof DirectionPatternSchema>;
export type BusRoute = z.infer<typeof BusRouteSchema>;
export type BusToeiData = z.infer<typeof BusToeiDataSchema>;
