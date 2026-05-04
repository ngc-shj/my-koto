// Edge route handler: Overpass-backed POI proxy with KV cache, rate limiting,
// SSRF hardening, and bbox clamping to Tokyo's 23 special wards.
import type { NextRequest } from "next/server";
import { kv as vercelKv } from "@vercel/kv";
import {
  TOKYO_23_BBOX,
  bboxAreaSqDeg,
  isBboxInside,
  snapBbox,
  type Bbox,
} from "@/config/geo";
import { UPSTREAM_HOSTS } from "@/config/proxy-allowlist";
import {
  OVERPASS_HOST,
  OVERPASS_URL,
  OverpassResponseSchema,
  buildOverpassQuery,
  elementsToMapPoints,
} from "@/lib/overpass";
import type { PointType, MapPoint } from "@/lib/map/types";
import {
  vercelKvStore,
  lruFallbackKvStore,
  withFallback,
  getClientIp,
  enforceRateLimit,
  kvKey,
  parseSchemaVersion,
} from "@/lib/proxy";

export const runtime = "edge";

// Overpass replies can be larger than weather (multiple categories x bbox).
// Cap at 1 MB; bbox area is also clamped so realistic queries stay well below.
const MAX_UPSTREAM_BYTES = 1024 * 1024;
const MAX_KV_BYTES = 256 * 1024;

// Bbox area cap: 0.04 deg^2 ≈ 0.2° × 0.2° ≈ 22km × 22km. Larger than any
// reasonable map viewport but small enough that the Overpass response stays
// within the size cap above.
const MAX_BBOX_AREA_SQDEG = 0.04;

function getAllowedOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

const lruStore = lruFallbackKvStore(2000);

function buildKv() {
  return withFallback(vercelKvStore(vercelKv), lruStore, (msg) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK;
    if (!webhookUrl) return;
    void fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: msg }),
    }).catch(() => {});
  });
}

function secureHeaders(origin: string): Headers {
  const h = new Headers();
  h.set("Cache-Control", "public, s-maxage=3600, stale-if-error=86400");
  h.set("Vary", "Accept-Encoding");
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Content-Type", "application/json");
  return h;
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Headers,
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function parseBboxParam(value: string | null): Bbox | null {
  if (!value) return null;
  const parts = value.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [south, west, north, east] = parts;
  if (south >= north || west >= east) return null;
  return { south, west, north, east };
}

function parseTypesParam(value: string | null): PointType[] | null {
  if (!value) return ["aed", "toilet"];
  const allowed = new Set<PointType>(["aed", "toilet"]);
  const out: PointType[] = [];
  for (const raw of value.split(",")) {
    const t = raw.trim();
    if (!allowed.has(t as PointType)) return null;
    if (!out.includes(t as PointType)) out.push(t as PointType);
  }
  return out.length === 0 ? null : out;
}

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = secureHeaders(allowedOrigin);

  // Validate bbox.
  const url = new URL(request.url);
  const bbox = parseBboxParam(url.searchParams.get("bbox"));
  if (bbox === null) {
    return jsonResponse(400, { error: "Invalid or missing bbox parameter" }, responseHeaders);
  }
  if (!isBboxInside(bbox, TOKYO_23_BBOX)) {
    return jsonResponse(
      400,
      { error: "bbox must be inside Tokyo 23 wards" },
      responseHeaders,
    );
  }
  if (bboxAreaSqDeg(bbox) > MAX_BBOX_AREA_SQDEG) {
    return jsonResponse(
      400,
      { error: "bbox area exceeds limit" },
      responseHeaders,
    );
  }

  // Validate types.
  const types = parseTypesParam(url.searchParams.get("types"));
  if (types === null) {
    return jsonResponse(400, { error: "Invalid types parameter" }, responseHeaders);
  }

  const schemaVersion = parseSchemaVersion();
  const kv = buildKv();

  // Rate limit: tighter than /api/weather because Overpass should not be
  // hammered (community-run infra, polite usage policy).
  const ip = getClientIp(request);
  const rateLimitKey = kvKey("rl", schemaVersion, "pois", ip);
  const rl = await enforceRateLimit(kv, rateLimitKey, 30, 60);
  if (!rl.ok) {
    const h = new Headers(responseHeaders);
    h.set("Retry-After", String(rl.retryAfter));
    return jsonResponse(429, { error: "Too Many Requests" }, h);
  }

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
    return jsonResponse(500, { error: "Upstream host mismatch" }, responseHeaders);
  }
  if (upstreamUrl.hostname !== OVERPASS_HOST) {
    return jsonResponse(500, { error: "Upstream host mismatch" }, responseHeaders);
  }

  // Build query with clamped bbox.
  const overpassQL = buildOverpassQuery(snapped, types);
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("User-Agent", "koto-city/1.0 (+/about)");
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
      responseHeaders,
    );
  }

  const parsed = OverpassResponseSchema.safeParse(upstreamData);
  if (!parsed.success) {
    return jsonResponse(
      502,
      { error: "Upstream response schema mismatch" },
      responseHeaders,
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
