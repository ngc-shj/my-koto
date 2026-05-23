// Edge route: JMA prefecture warning JSON proxy with KV cache, rate limit,
// and SSRF hardening. We extract Koto-ku's row before responding so the
// client never sees the full prefecture payload.
import type { NextRequest } from "next/server";
import { JMA_WARNING_CACHE } from "@/config/cache";
import {
  JMA_KOTO_AREA_CODE,
  JMA_TOKYO_PREFECTURE_CODE,
  buildJmaWarningUrl,
} from "@/config/opendata";
import { UPSTREAM_HOSTS } from "@/config/proxy-allowlist";
import { JmaWarningResponseSchema } from "@/lib/opendata/schemas/jma-warning";
import { extractAreaWarnings, type AreaWarnings } from "@/lib/jma/normalize";
import { kvKey, parseSchemaVersion } from "@/lib/proxy";
import {
  buildKv,
  rateLimitResponse,
  jsonResponseHeaders,
  getAllowedOrigin,
} from "@/lib/api-shared";

export const runtime = "edge";

const MAX_UPSTREAM_BYTES = 256 * 1024;
const MAX_KV_BYTES = 64 * 1024;

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
    maxAge: JMA_WARNING_CACHE.BROWSER_MAX_AGE,
    sMaxAge: JMA_WARNING_CACHE.SHARED_MAX_AGE,
    staleWhileRevalidate: JMA_WARNING_CACHE.STALE_WHILE_REVALIDATE,
    staleIfError: JMA_WARNING_CACHE.STALE_IF_ERROR,
  });

  const tooMany = await rateLimitResponse(
    request,
    { bucket: "jma-warn", limit: 60, windowSec: 60 },
    responseHeaders,
  );
  if (tooMany) return tooMany;

  const schemaVersion = parseSchemaVersion();
  const cacheKey = kvKey(
    "jma-warn",
    schemaVersion,
    `${JMA_TOKYO_PREFECTURE_CODE}:${JMA_KOTO_AREA_CODE}`,
  );
  const kv = buildKv();

  const upstreamUrl = buildJmaWarningUrl(JMA_TOKYO_PREFECTURE_CODE);
  if (upstreamUrl.hostname !== UPSTREAM_HOSTS.jma) {
    return errorResponse("Upstream host not allowed", 500);
  }

  const upstreamHeaders = new Headers();
  upstreamHeaders.set("User-Agent", "koto-city/1.0 (+/about)");
  upstreamHeaders.set("Accept", "application/json");

  try {
    const upstream = await fetch(upstreamUrl.toString(), {
      headers: upstreamHeaders,
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
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

    const parsed = JmaWarningResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Upstream response schema mismatch");
    }

    const normalized: AreaWarnings = extractAreaWarnings(
      parsed.data,
      JMA_KOTO_AREA_CODE,
    );

    const serialized = JSON.stringify(normalized);
    if (serialized.length <= MAX_KV_BYTES) {
      await kv
        .set(cacheKey, normalized, JMA_WARNING_CACHE.SHARED_MAX_AGE)
        .catch(() => {});
    }

    return new Response(serialized, { status: 200, headers: responseHeaders });
  } catch (_err) {
    // Upstream failure → stale-if-error: try the previously cached, already
    // normalized value. We re-check its shape with a lightweight runtime
    // guard rather than re-running Zod (the schema applies to the raw JMA
    // payload, not the normalized output).
    const stale = await kv.get<unknown>(cacheKey);
    if (isNormalized(stale)) {
      const h = new Headers(responseHeaders);
      h.set("X-Cache", "STALE");
      return new Response(JSON.stringify(stale), { status: 200, headers: h });
    }
    return errorResponse("Upstream unavailable", 502);
  }
}

function isNormalized(v: unknown): v is AreaWarnings {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.reportDatetime === "string" &&
    typeof o.areaCode === "string" &&
    Array.isArray(o.warnings)
  );
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
