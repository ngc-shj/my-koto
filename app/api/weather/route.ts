// Edge route handler: Open-Meteo proxy with KV cache, rate limiting, SSRF hardening.
import type { NextRequest } from "next/server";
import { kv as vercelKv } from "@vercel/kv";
import { KOTO_CENTER } from "@/config/geo";
import { WeatherResponseSchema } from "@/lib/opendata/schemas/weather";
import { buildWeatherUrl, validateUpstreamHost, WEATHER_ALLOWED_HOSTS } from "@/lib/opendata/weather";
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

// Max allowed response body size from upstream (256 KB).
const MAX_UPSTREAM_BYTES = 256 * 1024;
// Max allowed KV value size (64 KB).
const MAX_KV_BYTES = 64 * 1024;

// Site origin for CORS (restrict to own origin).
// In production this should match the deployed URL; in dev allow any same-origin.
function getAllowedOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

// Shared LRU fallback store (process-local).
const lruStore = lruFallbackKvStore(1000);

function buildKv() {
  return withFallback(
    vercelKvStore(vercelKv),
    lruStore,
    (msg) => {
      // Discord notify hook: fire-and-forget
      const webhookUrl = process.env.DISCORD_WEBHOOK;
      if (webhookUrl) {
        void fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: msg }),
        }).catch(() => {
          // swallow Discord notification errors
        });
      }
    },
  );
}

function secureHeaders(origin: string): Headers {
  const h = new Headers();
  h.set("Cache-Control", "public, s-maxage=3600, stale-if-error=86400");
  h.set("Vary", "Accept-Encoding");
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Content-Type", "application/json");
  return h;
}

export async function GET(request: NextRequest): Promise<Response> {
  // Method guard (belt-and-suspenders: Next.js already routes GET here)
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  // Cache key: path only, ignore any query parameters.
  const schemaVersion = parseSchemaVersion();
  const cacheKey = kvKey("weather", schemaVersion, "koto-center");

  const kv = buildKv();
  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = secureHeaders(allowedOrigin);

  // Rate limiting: 60 req/min per client IP.
  const ip = getClientIp(request);
  const rateLimitKey = kvKey("rl", schemaVersion, "weather", ip);
  const rlResult = await enforceRateLimit(kv, rateLimitKey, 60, 60);
  if (!rlResult.ok) {
    const h = new Headers(responseHeaders);
    h.set("Retry-After", String(rlResult.retryAfter));
    return new Response(JSON.stringify({ error: "Too Many Requests" }), {
      status: 429,
      headers: h,
    });
  }

  // Build upstream URL using fixed Koto City coordinates (ignore request params).
  const upstreamUrl = buildWeatherUrl(KOTO_CENTER);

  // Validate upstream hostname against allowlist.
  if (!validateUpstreamHost(upstreamUrl, WEATHER_ALLOWED_HOSTS)) {
    return new Response(JSON.stringify({ error: "Upstream host not allowed" }), {
      status: 500,
      headers: responseHeaders,
    });
  }

  // Send only safe headers to upstream — never forward XFF/Cookie/Auth.
  const upstreamHeaders = new Headers();
  upstreamHeaders.set("User-Agent", "koto-city/1.0 (+/about)");
  upstreamHeaders.set("Accept", "application/json");

  let upstreamData: unknown = null;
  let upstreamOk = false;

  try {
    const upstreamResponse = await fetch(upstreamUrl.toString(), {
      headers: upstreamHeaders,
      redirect: "manual", // prevent SSRF via redirect
      signal: AbortSignal.timeout(5000),
    });

    // Reject non-200 upstream responses.
    if (!upstreamResponse.ok) {
      throw new Error(`Upstream HTTP ${upstreamResponse.status}`);
    }

    // Content-Type allowlist: only application/json.
    const contentType = upstreamResponse.headers.get("Content-Type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Unexpected Content-Type: ${contentType}`);
    }

    // Content-Length pre-check (if header is present).
    const contentLength = upstreamResponse.headers.get("Content-Length");
    if (contentLength != null) {
      const bytes = parseInt(contentLength, 10);
      if (!isNaN(bytes) && bytes > MAX_UPSTREAM_BYTES) {
        throw new Error(`Content-Length ${bytes} exceeds limit`);
      }
    }

    // Read body with size monitoring.
    const reader = upstreamResponse.body?.getReader();
    if (reader == null) {
      throw new Error("Empty upstream body");
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_UPSTREAM_BYTES) {
        reader.cancel().catch(() => {});
        throw new Error(`Response body exceeds ${MAX_UPSTREAM_BYTES} bytes`);
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder();
    const bodyText = decoder.decode(
      chunks.reduce((acc, chunk) => {
        const merged = new Uint8Array(acc.byteLength + chunk.byteLength);
        merged.set(acc, 0);
        merged.set(chunk, acc.byteLength);
        return merged;
      }, new Uint8Array(0)),
    );

    upstreamData = JSON.parse(bodyText);
    upstreamOk = true;
  } catch (_err) {
    // Upstream failure: try KV stale cache (stale-if-error).
    const stale = await kv.get<unknown>(cacheKey);
    if (stale != null) {
      // Re-validate stale data with Zod to prevent corrupted value propagation.
      const revalidated = WeatherResponseSchema.safeParse(stale);
      if (revalidated.success) {
        const h = new Headers(responseHeaders);
        h.set("X-Cache", "STALE");
        return new Response(JSON.stringify(revalidated.data), {
          status: 200,
          headers: h,
        });
      }
      // Stale data failed Zod — do not serve it.
      return new Response(JSON.stringify({ error: "Cached data invalid" }), {
        status: 503,
        headers: responseHeaders,
      });
    }
    return new Response(JSON.stringify({ error: "Upstream unavailable" }), {
      status: 502,
      headers: responseHeaders,
    });
  }

  if (!upstreamOk || upstreamData == null) {
    return new Response(JSON.stringify({ error: "Upstream error" }), {
      status: 502,
      headers: responseHeaders,
    });
  }

  // Zod validation of upstream response body.
  const parsed = WeatherResponseSchema.safeParse(upstreamData);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "Upstream response schema mismatch" }), {
      status: 502,
      headers: responseHeaders,
    });
  }

  // Store in KV cache (1h TTL + stale-if-error=86400 at CDN level).
  const serialized = JSON.stringify(parsed.data);
  if (serialized.length <= MAX_KV_BYTES) {
    await kv.set(cacheKey, parsed.data, 3600).catch(() => {
      // Non-fatal: continue serving even if KV write fails
    });
  }

  return new Response(serialized, {
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
