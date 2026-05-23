// Shared type for the /api/bus/stop-times endpoint. One entry per
// (route, direction) that actually publishes a schedule for the requested
// stop. Times are kept as GTFS-style HH:MM tokens (24h+ allowed) so the
// existing formatter in lib/bus/normalize.ts can render them.

export type StopTimesRow = {
  readonly routeId: string;
  readonly shortName: string;
  readonly directionId: "0" | "1";
  readonly headsign: string;
  readonly weekday: readonly string[];
  readonly saturday: readonly string[];
  readonly sunday: readonly string[];
};

export type StopTimesResponse = {
  readonly stopId: string;
  readonly routes: readonly StopTimesRow[];
};
