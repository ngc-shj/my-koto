// Edge route handler: Overpass-backed POI proxy with KV cache, rate limiting,
// SSRF hardening, and bbox clamping to Tokyo's 23 special wards.
import type { NextRequest } from "next/server";
import {
  TOKYO_23_BBOX,
  bboxAreaSqDeg,
  isBboxInside,
  snapBbox,
  type Bbox,
} from "@/config/geo";
import { POIS_CACHE } from "@/config/cache";
import { UPSTREAM_HOSTS } from "@/config/proxy-allowlist";
import {
  OVERPASS_HOST,
  OVERPASS_URL,
  OverpassResponseSchema,
  buildOverpassQuery,
  elementsToMapPoints,
} from "@/lib/overpass";
import type { MapPoint } from "@/lib/map/types";
import { LAYER_IDS, isLayerId, type LayerId } from "@/lib/map/registry";
import { kvKey, parseSchemaVersion } from "@/lib/proxy";
import {
  buildKv,
  rateLimitResponse,
  jsonResponseHeaders,
  getAllowedOrigin,
} from "@/lib/api-shared";
import { PRODUCT_UA_BARE } from "@/lib/upstream/ua";

export const runtime = "edge";

// Overpass replies can be larger than weather (multiple categories x bbox).
// Cap at 1 MB; bbox area is also clamped so realistic queries stay well below.
const MAX_UPSTREAM_BYTES = 1024 * 1024;
const MAX_KV_BYTES = 256 * 1024;

// Bbox area cap: 0.04 deg^2 ≈ 0.2° × 0.2° ≈ 22km × 22km. Larger than any
// reasonable map viewport but small enough that the Overpass response stays
// within the size cap above.
const MAX_BBOX_AREA_SQDEG = 0.04;

function jsonResponse(
  status: number,
  body: unknown,
  headers: Headers,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

// Error responses must not be cached by browsers or CDNs.
function errorHeaders(): Headers {
  const h = new Headers();
  h.set("Cache-Control", "no-store");
  h.set("Content-Type", "application/json");
  return h;
}

function parseBboxParam(value: string | null): Bbox | null {
  if (!value) return null;
  const parts = value.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) return null;
  return { south, west, north, east };
}

// When ?types= is omitted we request every registered layer so the route
// default matches /map's first-paint behaviour. The browser UI always sends
// an explicit types= so this branch only fires for direct API consumers.
function parseTypesParam(value: string | null): LayerId[] | null {
  if (!value) return [...LAYER_IDS];
  const allowed = new Set<string>(LAYER_IDS);
  const out: LayerId[] = [];
  for (const raw of value.split(",")) {
    const t = raw.trim();
    if (!isLayerId(t) || !allowed.has(t)) return null;
    if (!out.includes(t)) out.push(t);
  }
  return out.length === 0 ? null : out;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = jsonResponseHeaders(allowedOrigin, {
    maxAge: POIS_CACHE.BROWSER_MAX_AGE,
    sMaxAge: POIS_CACHE.SHARED_MAX_AGE,
    staleWhileRevalidate: POIS_CACHE.STALE_WHILE_REVALIDATE,
    staleIfError: POIS_CACHE.STALE_IF_ERROR,
  });

  // Rate limit via shared pipeline (F-14). 30 rpm/IP — Overpass is a
  // community-run resource, polite usage policy applies.
  const tooMany = await rateLimitResponse(
    request,
    { bucket: "pois", limit: 30, windowSec: 60 },
    responseHeaders,
  );
  if (tooMany) return tooMany;

  // Validate bbox.
  const url = new URL(request.url);
  const bbox = parseBboxParam(url.searchParams.get("bbox"));
  if (bbox === null) {
    return jsonResponse(400, { error: "Invalid or missing bbox parameter" }, errorHeaders());
  }
  if (!isBboxInside(bbox, TOKYO_23_BBOX)) {
    return jsonResponse(
      400,
      { error: "bbox must be inside Tokyo 23 wards" },
      errorHeaders(),
    );
  }
  if (bboxAreaSqDeg(bbox) > MAX_BBOX_AREA_SQDEG) {
    return jsonResponse(
      400,
      { error: "bbox area exceeds limit" },
      errorHeaders(),
    );
  }

  // Validate types.
  const types = parseTypesParam(url.searchParams.get("types"));
  if (types === null) {
    return jsonResponse(400, { error: "Invalid types parameter" }, errorHeaders());
  }

  const schemaVersion = parseSchemaVersion();
  const kv = buildKv();

  // Snap bbox to a grid so nearby viewport queries reuse the same KV entry.
  const snapped = snapBbox(bbox, 0.01);
  const cacheKey = kvKey(
    "pois",
    schemaVersion,
    types.slice().sort().join("+"),
    `${snapped.south},${snapped.west},${snapped.north},${snapped.east}`,
  );

  // Serve from cache if available.
  const cached = await kv.get<MapPoint[]>(cacheKey);
  if (cached != null && Array.isArray(cached)) {
    const h = new Headers(responseHeaders);
    h.set("X-Cache", "HIT");
    return jsonResponse(200, { records: cached, source: "osm" }, h);
  }

  // Build Overpass URL & validate hostname strictly.
  const upstreamUrl = new URL(OVERPASS_URL);
  if (upstreamUrl.hostname !== UPSTREAM_HOSTS.overpass) {
    return jsonResponse(500, { error: "Upstream host mismatch" }, errorHeaders());
  }
  if (upstreamUrl.hostname !== OVERPASS_HOST) {
    return jsonResponse(500, { error: "Upstream host mismatch" }, errorHeaders());
  }

  // Build query with clamped bbox.
  const overpassQL = buildOverpassQuery(snapped, types);
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("User-Agent", PRODUCT_UA_BARE);
  upstreamHeaders.set("Accept", "application/json");
  upstreamHeaders.set("Content-Type", "application/x-www-form-urlencoded");

  let upstreamData: unknown = null;
  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      method: "POST",
      // Overpass accepts the QL query in the form body. We use POST instead
      // of GET so the query string does not bloat the URL.
      body: `data=${encodeURIComponent(overpassQL)}`,
      headers: upstreamHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstreamResponse.ok) {
      throw new Error(`Upstream HTTP ${upstreamResponse.status}`);
    }
    const ct = upstreamResponse.headers.get("Content-Type") ?? "";
    if (!ct.includes("application/json")) {
      throw new Error(`Unexpected Content-Type: ${ct}`);
    }
    const cl = upstreamResponse.headers.get("Content-Length");
    if (cl != null) {
      const bytes = parseInt(cl, 10);
      if (!isNaN(bytes) && bytes > MAX_UPSTREAM_BYTES) {
        throw new Error(`Content-Length ${bytes} exceeds limit`);
      }
    }
    const reader = upstreamResponse.body?.getReader();
    if (reader == null) throw new Error("Empty upstream body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_BYTES) {
        reader.cancel().catch(() => {});
        throw new Error(`Body exceeds ${MAX_UPSTREAM_BYTES}`);
      }
      chunks.push(value);
    }
    const merged = chunks.reduce((acc, c) => {
      const out = new Uint8Array(acc.byteLength + c.byteLength);
      out.set(acc, 0);
      out.set(c, acc.byteLength);
      return out;
    }, new Uint8Array(0));
    upstreamData = JSON.parse(new TextDecoder().decode(merged));
  } catch (_err) {
    // No stale cache fallback for /pois — empty result is the safe default
    // because it does not promise the bundled Koto-ku coverage.
    return jsonResponse(
      502,
      { error: "Upstream unavailable" },
      errorHeaders(),
    );
  }

  const parsed = OverpassResponseSchema.safeParse(upstreamData);
  if (!parsed.success) {
    return jsonResponse(
      502,
      { error: "Upstream response schema mismatch" },
      errorHeaders(),
    );
  }

  const points = elementsToMapPoints(parsed.data.elements);
  const serialized = JSON.stringify(points);
  if (serialized.length <= MAX_KV_BYTES) {
    await kv.set(cacheKey, points, 3600).catch(() => {});
  }

  return jsonResponse(200, { records: points, source: "osm" }, responseHeaders);
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
