// Shared Edge route handler for the /api/datasets/* family. Each route
// just calls handleDatasetRoute() with its dataset key, schema, and the
// per-dataset Conditional fetcher — the rate-limit / KV cache / SWR /
// stale fallback boilerplate stays here so the four routes don't diverge.
//
// KV value shape (versioned): { data, version, fetchedAt }
//   data        — schema-validated payload
//   version     — opaque freshness token (CKAN metadata_modified) passed
//                 back to the fetcher next round; the fetcher returns
//                 { unchanged: true } when this matches upstream and we
//                 skip the body fetch entirely
//   fetchedAt   — ISO time of the last upstream check; bumped on 304 too
//                 so the cache TTL effectively renews without writing
//                 a fresh data blob

import type { NextRequest } from "next/server";
import type { z } from "zod";
import { DATASETS_CACHE } from "@/config/cache";
import {
  buildKv,
  getAllowedOrigin,
  jsonResponseHeaders,
  rateLimitResponse,
} from "@/lib/api-shared";
import { kvKey, parseSchemaVersion } from "@/lib/proxy";
import type { ConditionalLoadResult } from "./source";

export type DatasetRouteSpec<T> = {
  // KV key suffix and rate-limit bucket discriminator.
  key: string;
  schema: z.ZodType<T>;
  // Conditional load. Receives the previously-stored `version` (or
  // undefined if KV is empty / first ever fetch) and returns either
  // "unchanged" (304-style hit) or the new payload + new version.
  load: (
    prevVersion: string | undefined,
  ) => Promise<ConditionalLoadResult<T>>;
};

type CachedEntry<T> = {
  data: T;
  version: string;
  fetchedAt: string;
};

function isCachedEntry(v: unknown): v is CachedEntry<unknown> {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    "data" in o &&
    typeof o.version === "string" &&
    typeof o.fetchedAt === "string"
  );
}

function errorResponse(message: string, status: number): Response {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

export async function handleDatasetRoute<T>(
  request: NextRequest,
  spec: DatasetRouteSpec<T>,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(null, { status: 405 });
  }

  const allowedOrigin = getAllowedOrigin();
  const responseHeaders = jsonResponseHeaders(allowedOrigin, {
    maxAge: DATASETS_CACHE.BROWSER_MAX_AGE,
    sMaxAge: DATASETS_CACHE.SHARED_MAX_AGE,
    staleWhileRevalidate: DATASETS_CACHE.STALE_WHILE_REVALIDATE,
    staleIfError: DATASETS_CACHE.STALE_IF_ERROR,
  });

  const tooMany = await rateLimitResponse(
    request,
    { bucket: `dataset-${spec.key}`, limit: 60, windowSec: 60 },
    responseHeaders,
  );
  if (tooMany) return tooMany;

  const schemaVersion = parseSchemaVersion();
  const cacheKey = kvKey("dataset", schemaVersion, spec.key);
  const kv = buildKv();

  const prev = await kv.get<unknown>(cacheKey).catch(() => null);
  const prevEntry: CachedEntry<T> | null =
    isCachedEntry(prev) && spec.schema.safeParse(prev.data).success
      ? (prev as CachedEntry<T>)
      : null;

  try {
    const result = await spec.load(prevEntry?.version);
    if (result.unchanged && prevEntry) {
      // Upstream said 304: keep the cached body, just bump fetchedAt so
      // the KV TTL effectively resets without re-writing the payload.
      const entry: CachedEntry<T> = {
        data: prevEntry.data,
        version: result.version || prevEntry.version,
        fetchedAt: new Date().toISOString(),
      };
      await kv
        .set(cacheKey, entry, DATASETS_CACHE.SHARED_MAX_AGE)
        .catch(() => {});
      const h = new Headers(responseHeaders);
      h.set("X-Cache", "HIT-CONDITIONAL");
      return new Response(JSON.stringify(prevEntry.data), {
        status: 200,
        headers: h,
      });
    }
    if (result.unchanged) {
      // Upstream said 304 but we have no cached payload to serve — fall
      // through to a full fetch by re-invoking with no prevVersion.
      const fresh = await spec.load(undefined);
      if (fresh.unchanged) {
        // Pathological: upstream insists nothing changed yet we never
        // had a baseline. Treat as upstream error.
        return errorResponse("Upstream gave 304 with empty cache", 502);
      }
      const entry: CachedEntry<T> = {
        data: fresh.data,
        version: fresh.version,
        fetchedAt: new Date().toISOString(),
      };
      await kv
        .set(cacheKey, entry, DATASETS_CACHE.SHARED_MAX_AGE)
        .catch(() => {});
      return new Response(JSON.stringify(fresh.data), {
        status: 200,
        headers: responseHeaders,
      });
    }
    const entry: CachedEntry<T> = {
      data: result.data,
      version: result.version,
      fetchedAt: new Date().toISOString(),
    };
    await kv
      .set(cacheKey, entry, DATASETS_CACHE.SHARED_MAX_AGE)
      .catch(() => {});
    return new Response(JSON.stringify(result.data), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (_err) {
    if (prevEntry) {
      const h = new Headers(responseHeaders);
      h.set("X-Cache", "STALE");
      return new Response(JSON.stringify(prevEntry.data), {
        status: 200,
        headers: h,
      });
    }
    return errorResponse("Upstream unavailable", 502);
  }
}
