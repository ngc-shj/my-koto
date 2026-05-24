/**
 * Fetches the Toei Bus GTFS-JP feed, filters to routes touching Koto-ku,
 * and writes the result to data/bus-toei.json and/or Vercel KV.
 *
 * Run via:
 *   npx tsx scripts/fetch-bus-toei.ts                  # file only (default)
 *   npx tsx scripts/fetch-bus-toei.ts --target=kv      # KV only
 *   npx tsx scripts/fetch-bus-toei.ts --target=both    # file + KV
 *
 * KV target requires KV_REST_API_URL and KV_REST_API_TOKEN in the
 * environment (same vars @vercel/kv reads at runtime).
 *
 * Memory profile: the upstream zip is ~80 MB compressed (stop_times.txt is
 * ~72 MB once inflated). Everything is held in memory during transformation
 * because filtering down to Koto-ku routes shrinks the working set to a few
 * MB. Run with --max-old-space-size=2048 if Node defaults change later.
 */

import AdmZip from "adm-zip";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { TOEI_BUS_GTFS_URL } from "@/config/opendata";
import { KOTO_BBOX, isInsideBbox } from "@/config/geo";
import { busKvKey, busKvSchemaVersion } from "@/lib/map/bus-kv";
import {
  BusToeiDataSchema,
  type BusRoute,
  type BusStop,
  type BusToeiData,
  type DirectionPattern,
  type ServiceCategory,
  type StopDepartures,
} from "@/lib/opendata/schemas/bus";

const OUT_PATH = join(process.cwd(), "data", "bus-toei.json");

type Target = "file" | "kv" | "both";

function parseTarget(argv: readonly string[]): Target {
  for (const arg of argv) {
    if (arg.startsWith("--target=")) {
      const value = arg.slice("--target=".length);
      if (value === "file" || value === "kv" || value === "both") return value;
      throw new Error(
        `Invalid --target value: ${value}. Expected file|kv|both.`,
      );
    }
  }
  return "file";
}

// KV REST PUT — avoids importing @vercel/kv (which targets Edge/Node
// runtime, not a one-shot script) by hitting the REST API directly.
// Uses the same env vars @vercel/kv reads, so it works against the same
// project KV without extra config.
async function putKv(
  key: string,
  value: unknown,
): Promise<void> {
  const url = process.env["KV_REST_API_URL"];
  const token = process.env["KV_REST_API_TOKEN"];
  if (!url || !token) {
    throw new Error(
      "KV_REST_API_URL and KV_REST_API_TOKEN must be set for --target=kv",
    );
  }
  const body = JSON.stringify(value);
  // Upstash REST: POST { value } to /set/{key}. Body is the raw value
  // wrapped — Upstash stores it as a string under the key.
  const endpoint = `${url.replace(/\/$/, "")}/set/${encodeURIComponent(key)}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`KV PUT failed: HTTP ${res.status}`);
  }
}
const USER_AGENT =
  process.env["UA_OVERRIDE"] ?? "my-koto-bot/1.0 (+https://example.com/about)";
const TOEI_LICENSE = {
  name: "CC-BY 4.0",
  url: "https://creativecommons.org/licenses/by/4.0/deed.ja",
} as const;

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c ?? "";
      }
    } else {
      if (c === '"') {
        inQuote = true;
      } else if (c === ",") {
        out.push(cur);
        cur = "";
      } else {
        cur += c ?? "";
      }
    }
  }
  out.push(cur);
  return out;
}

type CsvRow = Record<string, string>;

function parseCsv(text: string): readonly CsvRow[] {
  const stripped = text.replace(/^﻿/, "");
  const lines = stripped.split(/\r?\n/);
  if (lines.length === 0) return [];
  const headerLine = lines[0];
  if (headerLine == null) return [];
  const headers = parseCsvRow(headerLine);
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line == null || line.length === 0) continue;
    const cols = parseCsvRow(line);
    const row: CsvRow = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (key == null) continue;
      row[key] = cols[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// GTFS row schemas (loose — only the fields we consume are validated)
// ---------------------------------------------------------------------------

const StopRowSchema = z.object({
  stop_id: z.string().min(1),
  stop_name: z.string().min(1),
  stop_lat: z.string().min(1),
  stop_lon: z.string().min(1),
});

const RouteRowSchema = z.object({
  route_id: z.string().min(1),
  agency_id: z.string().default(""),
  route_short_name: z.string().default(""),
  route_long_name: z.string().default(""),
});

const TripRowSchema = z.object({
  trip_id: z.string().min(1),
  route_id: z.string().min(1),
  service_id: z.string().min(1),
  direction_id: z.string().default("0"),
  trip_headsign: z.string().default(""),
  shape_id: z.string().default(""),
});

const ShapeRowSchema = z.object({
  shape_id: z.string().min(1),
  shape_pt_lat: z.string().min(1),
  shape_pt_lon: z.string().min(1),
  shape_pt_sequence: z.string().min(1),
});

const CalendarRowSchema = z.object({
  service_id: z.string().min(1),
  monday: z.string(),
  tuesday: z.string(),
  wednesday: z.string(),
  thursday: z.string(),
  friday: z.string(),
  saturday: z.string(),
  sunday: z.string(),
});

const StopTimeRowSchema = z.object({
  trip_id: z.string().min(1),
  stop_id: z.string().min(1),
  arrival_time: z.string().min(1),
  stop_sequence: z.string().min(1),
});

const FeedInfoRowSchema = z.object({
  feed_version: z.string().default("unknown"),
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function downloadZip(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/zip",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`GTFS download failed: HTTP ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

function readEntry(zip: AdmZip, name: string): string {
  const entry = zip.getEntry(name);
  if (entry == null) {
    throw new Error(`GTFS entry missing: ${name}`);
  }
  return entry.getData().toString("utf-8");
}

// Returns every parseable stop. We keep the full set so that routes
// touching Koto can carry their out-of-ward stops too — otherwise the
// map shows a polyline extending past the last in-ward stop with no
// pins to anchor it, and /bus timetable search misses lookups by an
// out-of-ward stop name on a Koto-serving line.
function pickAllStops(rows: readonly CsvRow[]): Map<string, BusStop> {
  const out = new Map<string, BusStop>();
  for (const raw of rows) {
    const parsed = StopRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const lat = parseFloat(parsed.data.stop_lat);
    const lng = parseFloat(parsed.data.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    out.set(parsed.data.stop_id, {
      stopId: parsed.data.stop_id,
      name: parsed.data.stop_name,
      lat,
      lng,
    });
  }
  return out;
}

// Subset of stop ids that lie inside the Koto bbox — used as the
// "does this route touch the ward" qualifier.
function kotoStopIdsFrom(stops: Map<string, BusStop>): Set<string> {
  const ids = new Set<string>();
  for (const [id, stop] of stops) {
    if (isInsideBbox({ lat: stop.lat, lng: stop.lng }, KOTO_BBOX)) {
      ids.add(id);
    }
  }
  return ids;
}

type StopTime = {
  tripId: string;
  stopId: string;
  arrivalTime: string;
  sequence: number;
};

function groupShapes(
  rows: readonly CsvRow[],
): Map<string, [number, number][]> {
  type Point = { sequence: number; lng: number; lat: number };
  const buckets = new Map<string, Point[]>();
  for (const raw of rows) {
    const parsed = ShapeRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const lat = parseFloat(parsed.data.shape_pt_lat);
    const lng = parseFloat(parsed.data.shape_pt_lon);
    const seq = parseInt(parsed.data.shape_pt_sequence, 10);
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      !Number.isFinite(seq)
    ) {
      continue;
    }
    const arr = buckets.get(parsed.data.shape_id) ?? [];
    arr.push({ sequence: seq, lng, lat });
    buckets.set(parsed.data.shape_id, arr);
  }
  const out = new Map<string, [number, number][]>();
  for (const [shapeId, pts] of buckets) {
    pts.sort((a, b) => a.sequence - b.sequence);
    // Tuple order matches MapLibre's [lng, lat] convention.
    out.set(
      shapeId,
      pts.map((p) => [p.lng, p.lat] as [number, number]),
    );
  }
  return out;
}

function groupStopTimesByTrip(
  rows: readonly CsvRow[],
): Map<string, StopTime[]> {
  const out = new Map<string, StopTime[]>();
  for (const raw of rows) {
    const parsed = StopTimeRowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const seq = parseInt(parsed.data.stop_sequence, 10);
    if (!Number.isFinite(seq)) continue;
    const arr = out.get(parsed.data.trip_id) ?? [];
    arr.push({
      tripId: parsed.data.trip_id,
      stopId: parsed.data.stop_id,
      arrivalTime: parsed.data.arrival_time,
      sequence: seq,
    });
    out.set(parsed.data.trip_id, arr);
  }
  for (const arr of out.values()) {
    arr.sort((a, b) => a.sequence - b.sequence);
  }
  return out;
}

function categorizeService(row: CsvRow): readonly ServiceCategory[] {
  const parsed = CalendarRowSchema.safeParse(row);
  if (!parsed.success) return [];
  const c = parsed.data;
  const out: ServiceCategory[] = [];
  if (
    c.monday === "1" ||
    c.tuesday === "1" ||
    c.wednesday === "1" ||
    c.thursday === "1" ||
    c.friday === "1"
  ) {
    out.push("weekday");
  }
  if (c.saturday === "1") out.push("saturday");
  if (c.sunday === "1") out.push("sunday");
  return out;
}

// Strip "HH:MM:SS" down to "HH:MM" — schedules display to the minute. Hours
// >= 24 are preserved so callers can decide whether to flag next-day trips.
function shortenArrivalTime(raw: string): string {
  const match = /^([0-9]{1,2}:[0-5][0-9])(?::[0-5][0-9])?$/.exec(raw.trim());
  if (match == null) return raw.trim();
  return match[1] ?? raw.trim();
}

type DirectionKey = "0" | "1";

type BuildResult = {
  routes: BusRoute[];
  stops: Record<string, BusStop>;
};

// Best-effort union of stop sequences across all trips in one direction.
// `trips` is expected sorted longest-first so the base path is the most
// complete one. Variant-only stops are inserted just before the next
// shared stop downstream, which keeps geographical order intact for
// typical terminal/branch patterns. Stops with no downstream anchor
// (variant terminals beyond the base path) are appended.
function mergeStopSequences(
  trips: readonly (readonly StopTime[])[],
): readonly string[] {
  const base = trips[0];
  if (base == null) return [];
  const result: string[] = base.map((st) => st.stopId);
  const inResult = new Set(result);
  for (let t = 1; t < trips.length; t++) {
    const trip = trips[t];
    if (trip == null) continue;
    for (let i = 0; i < trip.length; i++) {
      const sid = trip[i]?.stopId;
      if (sid == null || inResult.has(sid)) continue;
      let inserted = false;
      for (let j = i + 1; j < trip.length; j++) {
        const anchor = trip[j]?.stopId;
        if (anchor == null) continue;
        const pos = result.indexOf(anchor);
        if (pos >= 0) {
          result.splice(pos, 0, sid);
          inResult.add(sid);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        result.push(sid);
        inResult.add(sid);
      }
    }
  }
  return result;
}

function buildRoutes(args: {
  stops: Map<string, BusStop>;
  kotoStopIds: Set<string>;
  routes: Map<string, z.infer<typeof RouteRowSchema>>;
  trips: Map<string, z.infer<typeof TripRowSchema>>;
  stopTimesByTrip: Map<string, StopTime[]>;
  serviceCategories: Map<string, readonly ServiceCategory[]>;
  // shape_id → ordered list of [lng, lat] points (already sorted by
  // shape_pt_sequence). Only shapes referenced by Koto trips are
  // included so the bundle stays small.
  shapes: Map<string, [number, number][]>;
}): BuildResult {
  const tripsByRouteDir = new Map<string, string[]>();
  const referencedStopIds = new Set<string>();
  for (const trip of args.trips.values()) {
    const stopTimes = args.stopTimesByTrip.get(trip.trip_id);
    if (stopTimes == null || stopTimes.length === 0) continue;
    const touchesKoto = stopTimes.some((st) =>
      args.kotoStopIds.has(st.stopId),
    );
    if (!touchesKoto) continue;
    const dir: DirectionKey = trip.direction_id === "1" ? "1" : "0";
    const key = `${trip.route_id}__${dir}`;
    const bucket = tripsByRouteDir.get(key) ?? [];
    bucket.push(trip.trip_id);
    tripsByRouteDir.set(key, bucket);
    for (const st of stopTimes) {
      referencedStopIds.add(st.stopId);
    }
  }

  const builtRoutes: BusRoute[] = [];
  const seenRoutes = new Set<string>();

  for (const [key, tripIds] of tripsByRouteDir) {
    const [routeId, dirRaw] = key.split("__");
    if (routeId == null || dirRaw == null) continue;
    const dir: DirectionKey = dirRaw === "1" ? "1" : "0";
    seenRoutes.add(routeId);

    // Merge every trip's stop list in this direction. Picking only the
    // longest trip as canonical dropped variant-only stops (terminals,
    // branch detours), leaving polylines drawn through stops the map had
    // no pin for and breaking /bus/[stopId] / search lookups for those
    // same stops. We anchor each variant-only stop to the next shared
    // stop downstream so the merged order stays geographically sensible.
    const trips = tripIds
      .map((id) => args.stopTimesByTrip.get(id) ?? [])
      .sort((a, b) => b.length - a.length);
    const stopSequence: readonly string[] = mergeStopSequences(trips);

    // headsign: most common across the trips in this direction.
    const headsignCount = new Map<string, number>();
    for (const tid of tripIds) {
      const trip = args.trips.get(tid);
      if (trip == null) continue;
      const hs = trip.trip_headsign;
      headsignCount.set(hs, (headsignCount.get(hs) ?? 0) + 1);
    }
    const headsign = pickMostFrequent(headsignCount, "");

    // Collect EVERY distinct shape referenced by surviving trips. A
    // route+direction often has multiple shape_ids (different terminals,
    // branch detours): rendering only the most-used one leaves visible
    // gaps along the variants. We sort by usage (most-used first) so
    // the visible polyline z-order matches "main path on top".
    const shapeUsage = new Map<string, number>();
    for (const tid of tripIds) {
      const trip = args.trips.get(tid);
      if (trip == null) continue;
      const sid = trip.shape_id;
      if (sid.length === 0) continue;
      shapeUsage.set(sid, (shapeUsage.get(sid) ?? 0) + 1);
    }
    const sortedShapeIds = Array.from(shapeUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([sid]) => sid);
    const allShapes: [number, number][][] = [];
    for (const sid of sortedShapeIds) {
      const pts = args.shapes.get(sid);
      if (pts != null && pts.length >= 2) allShapes.push(pts);
    }
    // `shape` kept for back-compat — first entry is the most-used.
    const primaryShape = allShapes[0];

    const schedule = {
      weekday: aggregateSchedule(tripIds, "weekday", args),
      saturday: aggregateSchedule(tripIds, "saturday", args),
      sunday: aggregateSchedule(tripIds, "sunday", args),
    };

    let entry = builtRoutes.find((r) => r.routeId === routeId);
    if (entry == null) {
      const routeRow = args.routes.get(routeId);
      if (routeRow == null) continue;
      entry = {
        routeId,
        shortName: routeRow.route_short_name || routeId,
        longName: routeRow.route_long_name,
        agencyId: routeRow.agency_id,
        directions: [],
      };
      builtRoutes.push(entry);
    }
    (entry.directions as DirectionPattern[]).push({
      directionId: dir,
      headsign,
      stopSequence,
      shape: primaryShape,
      shapes: allShapes.length > 0 ? allShapes : undefined,
      schedule,
    });
  }

  // Sort directions so "0" comes first for deterministic output.
  for (const r of builtRoutes) {
    (r.directions as DirectionPattern[]).sort((a, b) =>
      a.directionId.localeCompare(b.directionId),
    );
  }
  builtRoutes.sort((a, b) => a.shortName.localeCompare(b.shortName, "ja"));

  // Project stops down to only those referenced by surviving routes.
  const stopsOut: Record<string, BusStop> = {};
  for (const sid of referencedStopIds) {
    const stop = args.stops.get(sid);
    if (stop != null) stopsOut[sid] = stop;
  }

  return { routes: builtRoutes, stops: stopsOut };
}

function aggregateSchedule(
  tripIds: readonly string[],
  category: ServiceCategory,
  args: {
    trips: Map<string, z.infer<typeof TripRowSchema>>;
    stopTimesByTrip: Map<string, StopTime[]>;
    serviceCategories: Map<string, readonly ServiceCategory[]>;
  },
): readonly StopDepartures[] {
  const perStop = new Map<string, string[]>();
  for (const tid of tripIds) {
    const trip = args.trips.get(tid);
    if (trip == null) continue;
    const cats = args.serviceCategories.get(trip.service_id);
    if (cats == null || !cats.includes(category)) continue;
    const stopTimes = args.stopTimesByTrip.get(tid) ?? [];
    for (const st of stopTimes) {
      const list = perStop.get(st.stopId) ?? [];
      list.push(shortenArrivalTime(st.arrivalTime));
      perStop.set(st.stopId, list);
    }
  }
  const out: StopDepartures[] = [];
  for (const [stopId, times] of perStop) {
    const deduped = Array.from(new Set(times));
    deduped.sort((a, b) => compareBusTimes(a, b));
    out.push({ stopId, times: deduped });
  }
  return out;
}

function compareBusTimes(a: string, b: string): number {
  const toMinutes = (t: string): number => {
    const m = /^([0-9]{1,2}):([0-5][0-9])/.exec(t);
    if (m == null) return Number.MAX_SAFE_INTEGER;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  return toMinutes(a) - toMinutes(b);
}

function pickMostFrequent(counts: Map<string, number>, fallback: string): string {
  let best = fallback;
  let bestCount = -1;
  for (const [k, v] of counts) {
    if (k.length > 0 && v > bestCount) {
      best = k;
      bestCount = v;
    }
  }
  return best;
}

async function main(): Promise<void> {
  console.log(`Downloading ${TOEI_BUS_GTFS_URL} ...`);
  const zipBuf = await downloadZip(TOEI_BUS_GTFS_URL);
  console.log(`Downloaded ${(zipBuf.byteLength / 1024 / 1024).toFixed(1)} MB`);

  const zip = new AdmZip(zipBuf);

  const stopsRows = parseCsv(readEntry(zip, "stops.txt"));
  const routesRows = parseCsv(readEntry(zip, "routes.txt"));
  const tripsRows = parseCsv(readEntry(zip, "trips.txt"));
  const calendarRows = parseCsv(readEntry(zip, "calendar.txt"));
  const feedInfoRows = parseCsv(readEntry(zip, "feed_info.txt"));
  const stopTimesRows = parseCsv(readEntry(zip, "stop_times.txt"));
  // shapes.txt is optional in GTFS-JP; if it's missing we just fall
  // back to stop-connected polylines downstream.
  const shapesRows = zip.getEntry("shapes.txt")
    ? parseCsv(readEntry(zip, "shapes.txt"))
    : [];

  const stops = pickAllStops(stopsRows);
  const kotoStopIds = kotoStopIdsFrom(stops);
  console.log(
    `Stops total: ${stops.size} (inside Koto bbox: ${kotoStopIds.size})`,
  );

  const stopTimesByTrip = groupStopTimesByTrip(stopTimesRows);

  const routes = new Map<string, z.infer<typeof RouteRowSchema>>();
  for (const raw of routesRows) {
    const parsed = RouteRowSchema.safeParse(raw);
    if (parsed.success) routes.set(parsed.data.route_id, parsed.data);
  }

  const trips = new Map<string, z.infer<typeof TripRowSchema>>();
  for (const raw of tripsRows) {
    const parsed = TripRowSchema.safeParse(raw);
    if (parsed.success) trips.set(parsed.data.trip_id, parsed.data);
  }

  const serviceCategories = new Map<string, readonly ServiceCategory[]>();
  for (const raw of calendarRows) {
    const parsed = CalendarRowSchema.safeParse(raw);
    if (parsed.success) {
      serviceCategories.set(parsed.data.service_id, categorizeService(raw));
    }
  }

  const shapes = groupShapes(shapesRows);
  console.log(`Shapes parsed: ${shapes.size}`);
  const built = buildRoutes({
    stops,
    kotoStopIds,
    routes,
    trips,
    stopTimesByTrip,
    serviceCategories,
    shapes,
  });

  console.log(`Routes serving Koto: ${built.routes.length}`);
  console.log(`Referenced stops: ${Object.keys(built.stops).length}`);

  const feedInfo = feedInfoRows[0];
  const feedVersion =
    feedInfo != null
      ? (FeedInfoRowSchema.safeParse(feedInfo).data?.feed_version ?? "unknown")
      : "unknown";

  const out: BusToeiData = {
    fetchedAt: new Date().toISOString(),
    feedVersion,
    source: TOEI_BUS_GTFS_URL,
    license: TOEI_LICENSE,
    stops: built.stops,
    routes: built.routes,
  };

  // Re-validate so a future schema drift breaks the script, not a page.
  const validated = BusToeiDataSchema.safeParse(out);
  if (!validated.success) {
    const summary = validated.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Output failed schema validation: ${summary}`);
  }

  const target = parseTarget(process.argv.slice(2));
  const serialized = JSON.stringify(validated.data);
  const sizeKb = (serialized.length / 1024).toFixed(1);

  if (target === "file" || target === "both") {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(validated.data, null, 2) + "\n", "utf-8");
    console.log(`Saved: ${OUT_PATH} (${sizeKb} KB)`);
  }

  if (target === "kv" || target === "both") {
    const key = busKvKey(busKvSchemaVersion());
    await putKv(key, validated.data);
    console.log(`Saved to KV: ${key} (${sizeKb} KB)`);
  }
}

if (process.argv[1] && process.argv[1].endsWith("fetch-bus-toei.ts")) {
  main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Unhandled error: ${message}`);
    process.exit(1);
  });
}

// Exported for testing.
export {
  parseCsv,
  parseCsvRow,
  pickAllStops,
  kotoStopIdsFrom,
  groupStopTimesByTrip,
  categorizeService,
  shortenArrivalTime,
  compareBusTimes,
  aggregateSchedule,
  buildRoutes,
};
