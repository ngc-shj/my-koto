// Node route returning per-route schedules for one bus stop. We read
// the GTFS bundle from the libsql snapshot (BLOB) and slice it to one
// stop instead of sending the whole catalog to every map client.
import type { NextRequest } from "next/server";
import { rateLimitResponse, jsonResponseHeaders, getAllowedOrigin } from "@/lib/api-shared";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readBus } from "@/lib/opendata/db/readers";
import type {
  StopTimesResponse,
  StopTimesRow,
} from "@/lib/bus/stop-times";

// GTFS stop ids in this bundle look like "0675-03"; cap the length to
// bound the work and reject obviously malformed input before we touch
// the data.
const STOP_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== "GET") return new Response(null, { status: 405 });

  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = jsonResponseHeaders(allowedOrigin);

  const tooMany = await rateLimitResponse(
    request,
    { bucket: "bus-stop-times", limit: 60, windowSec: 60 },
    responseHeaders,
  );
  if (tooMany) return tooMany;

  const stopId = request.nextUrl.searchParams.get("stop");
  if (stopId == null || !STOP_ID_RE.test(stopId)) {
    return errorResponse("invalid stop param", 400);
  }

  const data = await readBus(openDatasetsDb());
  if (data.stops[stopId] == null) {
    return errorResponse("stop not found", 404);
  }

  const rows: StopTimesRow[] = [];
  for (const route of data.routes) {
    for (const dir of route.directions) {
      const weekday =
        dir.schedule.weekday.find((s) => s.stopId === stopId)?.times ?? [];
      const saturday =
        dir.schedule.saturday.find((s) => s.stopId === stopId)?.times ?? [];
      const sunday =
        dir.schedule.sunday.find((s) => s.stopId === stopId)?.times ?? [];
      if (
        weekday.length === 0 &&
        saturday.length === 0 &&
        sunday.length === 0
      ) {
        continue;
      }
      rows.push({
        routeId: route.routeId,
        shortName: route.shortName,
        directionId: dir.directionId,
        headsign: dir.headsign,
        weekday,
        saturday,
        sunday,
      });
    }
  }

  const out: StopTimesResponse = { stopId, routes: rows };
  return new Response(JSON.stringify(out), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      // The bundled data only changes on deploy, so the response is
      // safe to cache for a long time at the CDN edge.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}

export async function POST(): Promise<Response> {
  return new Response(null, { status: 405 });
}
