// Serves the Toei bus bundle as JSON for the /map client. The bundle is
// large (~12 MB) and only refreshes when an admin re-runs
// scripts/fetch-bus-toei.ts. Lookup order:
//   1. KV (set by the admin script with `--target=kv`)
//   2. Static fallback bundled at build time (data/bus-toei.json)
// The static fallback keeps local dev and first-deploys working before
// the admin push, at the cost of bundling the 12 MB once into this
// route's deploy artifact (not into /map's RSC payload).
import type { NextRequest } from "next/server";
import { MAP_BUS_CACHE } from "@/config/cache";
import { BusToeiDataSchema } from "@/lib/opendata/schemas/bus";
import { busKvKey } from "@/lib/map/bus-kv";
import { parseSchemaVersion } from "@/lib/proxy";
import {
  buildKv,
  rateLimitResponse,
  jsonResponseHeaders,
  getAllowedOrigin,
} from "@/lib/api-shared";
import busFallback from "@/data/bus-toei.json";

export const runtime = "edge";

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

  const cacheKey = busKvKey(parseSchemaVersion());
  const kv = buildKv();

  // Try KV first so admin-pushed data wins over the bundled fallback.
  // Wrapped in try/catch because KV failure must not block serving — the
  // bundled fallback is always available.
  let payload: unknown = null;
  try {
    payload = await kv.get<unknown>(cacheKey);
  } catch {
    payload = null;
  }
  if (payload == null) {
    payload = busFallback;
  }

  const parsed = BusToeiDataSchema.safeParse(payload);
  if (!parsed.success) {
    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    headers.set("Content-Type", "application/json");
    return new Response(
      JSON.stringify({ error: "Bus bundle failed schema validation" }),
      { status: 502, headers },
    );
  }

  return new Response(JSON.stringify(parsed.data), {
    status: 200,
    headers: responseHeaders,
  });
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
