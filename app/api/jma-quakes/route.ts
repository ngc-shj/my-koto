// Edge route: JMA quake list proxy with KV cache, rate limit, and SSRF
// hardening. Trims to the latest 10 events and normalises 江東区's
// observed intensity inline so the client never sees the full nationwide
// city breakdown (multiple-MB payloads in heavy quake periods).
import type { NextRequest } from "next/server";
import { JMA_QUAKE_CACHE } from "@/config/cache";
import { JMA_KOTO_AREA_CODE, JMA_QUAKE_LIST_URL } from "@/config/opendata";
import { UPSTREAM_HOSTS } from "@/config/proxy-allowlist";
import { JmaQuakeListSchema } from "@/lib/opendata/schemas/jma-quake";
import { buildQuakeFeed, type QuakeFeed } from "@/lib/jma/quake";
import { kvKey, parseSchemaVersion } from "@/lib/proxy";
import {
  buildKv,
  rateLimitResponse,
  jsonResponseHeaders,
  getAllowedOrigin,
} from "@/lib/api-shared";
import { upstreamGet } from "@/lib/upstream/fetch";

export const runtime = "edge";

// Raw quake list can grow past 200 KB during active periods. 1 MB cap is
// generous; if upstream ever exceeds it we want to fail loudly.
const MAX_UPSTREAM_BYTES = 1024 * 1024;
const MAX_KV_BYTES = 64 * 1024;
const QUAKE_LIMIT = 10;

function errorResponse(message: string, status: number): Response {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = jsonResponseHeaders(allowedOrigin, {
    maxAge: JMA_QUAKE_CACHE.BROWSER_MAX_AGE,
    sMaxAge: JMA_QUAKE_CACHE.SHARED_MAX_AGE,
    staleWhileRevalidate: JMA_QUAKE_CACHE.STALE_WHILE_REVALIDATE,
    staleIfError: JMA_QUAKE_CACHE.STALE_IF_ERROR,
  });

  const tooMany = await rateLimitResponse(
    request,
    { bucket: "jma-quake", limit: 60, windowSec: 60 },
    responseHeaders,
  );
  if (tooMany) return tooMany;

  const schemaVersion = parseSchemaVersion();
  const cacheKey = kvKey("jma-quake", schemaVersion, JMA_KOTO_AREA_CODE);
  const kv = buildKv();

  const upstreamUrl = new URL(JMA_QUAKE_LIST_URL);
  if (upstreamUrl.hostname !== UPSTREAM_HOSTS.jma) {
    return errorResponse("Upstream host not allowed", 500);
  }

  try {
    const upstream = await upstreamGet(upstreamUrl, {
      accept: "application/json",
    });

    if (!upstream.ok) {
      throw new Error(`Upstream HTTP ${upstream.status}`);
    }
    const contentType = upstream.headers.get("Content-Type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Unexpected Content-Type: ${contentType}`);
    }
    const contentLength = upstream.headers.get("Content-Length");
    if (contentLength != null) {
      const bytes = parseInt(contentLength, 10);
      if (!isNaN(bytes) && bytes > MAX_UPSTREAM_BYTES) {
        throw new Error(`Content-Length ${bytes} exceeds limit`);
      }
    }

    const reader = upstream.body?.getReader();
    if (reader == null) throw new Error("Empty upstream body");

    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_BYTES) {
        reader.cancel().catch(() => {});
        throw new Error(`Response body exceeds ${MAX_UPSTREAM_BYTES} bytes`);
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder();
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const bodyText = decoder.decode(merged);
    const raw: unknown = JSON.parse(bodyText);

    const parsed = JmaQuakeListSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Upstream response schema mismatch");
    }

    const feed: QuakeFeed = buildQuakeFeed(
      parsed.data,
      JMA_KOTO_AREA_CODE,
      QUAKE_LIMIT,
    );

    const serialized = JSON.stringify(feed);
    if (serialized.length <= MAX_KV_BYTES) {
      await kv
        .set(cacheKey, feed, JMA_QUAKE_CACHE.SHARED_MAX_AGE)
        .catch(() => {});
    }
    return new Response(serialized, { status: 200, headers: responseHeaders });
  } catch (_err) {
    const stale = await kv.get<unknown>(cacheKey);
    if (isQuakeFeed(stale)) {
      const h = new Headers(responseHeaders);
      h.set("X-Cache", "STALE");
      return new Response(JSON.stringify(stale), { status: 200, headers: h });
    }
    return errorResponse("Upstream unavailable", 502);
  }
}

function isQuakeFeed(v: unknown): v is QuakeFeed {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return Array.isArray(o.events);
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
