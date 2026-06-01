// Serves the Toei bus bundle as JSON for the /map client. The bundle is
// large (~12 MB) and lives as a single libsql BLOB row — ensure-data
// keeps it refreshed via Conditional fetch (Last-Modified). This route
// is Node runtime because libsql file:// needs fs access; in production
// the same code talks to Turso once DATASETS_DB_URL is set.
import type { NextRequest } from "next/server";
import { MAP_BUS_CACHE } from "@/config/cache";
import {
  rateLimitResponse,
  jsonResponseHeaders,
  getAllowedOrigin,
} from "@/lib/api-shared";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readBus } from "@/lib/opendata/db/readers";

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = jsonResponseHeaders(allowedOrigin, {
    maxAge: MAP_BUS_CACHE.BROWSER_MAX_AGE,
    sMaxAge: MAP_BUS_CACHE.SHARED_MAX_AGE,
    staleWhileRevalidate: MAP_BUS_CACHE.STALE_WHILE_REVALIDATE,
    staleIfError: MAP_BUS_CACHE.STALE_IF_ERROR,
  });

  // Generous limit — large bundle but single-file fetch, and the route is
  // CDN-cached so origin load is bounded anyway.
  const tooMany = await rateLimitResponse(
    request,
    { bucket: "map-bus", limit: 30, windowSec: 60 },
    responseHeaders,
  );
  if (tooMany) return tooMany;

  try {
    const data = await readBus(openDatasetsDb());
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error("[map/bus]", err instanceof Error ? err.message : String(err));
    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Type", "application/json");
    return new Response(JSON.stringify({ error: "Bus bundle unavailable" }), {
      status: 503,
      headers,
    });
  }
}

export async function POST(): Promise<Response> {
  return new Response(null, { status: 405 });
}
export async function PUT(): Promise<Response> {
  return new Response(null, { status: 405 });
}
export async function DELETE(): Promise<Response> {
  return new Response(null, { status: 405 });
}
