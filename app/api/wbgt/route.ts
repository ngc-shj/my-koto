// Edge route handler: 環境省 WBGT forecast proxy with KV cache, rate limit,
// SSRF hardening. Mirrors the shape of /api/weather so the security posture
// is uniform across upstreams.
import type { NextRequest } from "next/server";
import { WBGT_STATION_CODE } from "@/config/opendata";
import { WbgtDataSchema } from "@/lib/opendata/schemas/wbgt";
import {
  buildWbgtUrl,
  parseWbgtCsv,
  validateUpstreamHost,
  WBGT_ALLOWED_HOSTS,
} from "@/lib/opendata/wbgt";
import { kvKey, parseSchemaVersion } from "@/lib/proxy";
import {
  buildKv,
  rateLimitResponse,
  jsonResponseHeaders,
  getAllowedOrigin,
} from "@/lib/api-shared";
import { upstreamGet } from "@/lib/upstream/fetch";

export const runtime = "edge";

// WBGT CSV is small (~150 bytes data + ~200 bytes header).
const MAX_UPSTREAM_BYTES = 16 * 1024;
const MAX_KV_BYTES = 16 * 1024;

export async function GET(request: NextRequest): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = jsonResponseHeaders(allowedOrigin);

  const tooMany = await rateLimitResponse(
    request,
    { bucket: "wbgt", limit: 60, windowSec: 60 },
    responseHeaders,
  );
  if (tooMany) return tooMany;

  const schemaVersion = parseSchemaVersion();
  const cacheKey = kvKey("wbgt", schemaVersion, WBGT_STATION_CODE);
  const kv = buildKv();

  const upstreamUrl = buildWbgtUrl(WBGT_STATION_CODE);
  if (!validateUpstreamHost(upstreamUrl, WBGT_ALLOWED_HOSTS)) {
    return new Response(
      JSON.stringify({ error: "Upstream host not allowed" }),
      { status: 500, headers: responseHeaders },
    );
  }

  try {
    // The CSV is text/csv per content-type header; the upstream sometimes
    // omits it so we don't enforce a strict accept.
    const upstream = await upstreamGet(upstreamUrl, {
      accept: "text/csv,*/*;q=0.5",
    });

    if (!upstream.ok) {
      throw new Error(`Upstream HTTP ${upstream.status}`);
    }

    const cl = upstream.headers.get("Content-Length");
    if (cl != null) {
      const bytes = parseInt(cl, 10);
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
    const text = new TextDecoder().decode(merged);

    const parsed = parseWbgtCsv(text);
    const serialized = JSON.stringify(parsed);
    if (serialized.length <= MAX_KV_BYTES) {
      // 30 min TTL — 環境省 publishes the forecast 5 times a day so a fresh
      // value is at most ~5h stale. Half-hour cache balances upstream load
      // against UI freshness.
      await kv.set(cacheKey, parsed, 1800).catch(() => {});
    }
    return new Response(serialized, { status: 200, headers: responseHeaders });
  } catch (_err) {
    // Stale-if-error: fall back to last known good value when upstream fails.
    const stale = await kv.get<unknown>(cacheKey);
    if (stale != null) {
      const reparsed = WbgtDataSchema.safeParse(stale);
      if (reparsed.success) {
        const h = new Headers(responseHeaders);
        h.set("X-Cache", "STALE");
        return new Response(JSON.stringify(reparsed.data), {
          status: 200,
          headers: h,
        });
      }
    }
    return new Response(JSON.stringify({ error: "Upstream unavailable" }), {
      status: 502,
      headers: responseHeaders,
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
