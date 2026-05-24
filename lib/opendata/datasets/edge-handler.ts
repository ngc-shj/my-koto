// Shared Edge route handler for the /api/datasets/* family. Each route
// just calls handleDatasetRoute() with its dataset key, schema, and the
// per-dataset fetch function — the rate-limit / KV cache / SWR / stale
// fallback boilerplate stays here so the four routes don't diverge.

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

export type DatasetRouteSpec<T> = {
  // KV key suffix and rate-limit bucket discriminator.
  key: string;
  schema: z.ZodType<T>;
  // Pure fetch + parse + validate. Errors thrown here are treated as
  // upstream failures and trigger the stale-cache fallback.
  load: () => Promise<T>;
};

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

  try {
    const data = await spec.load();
    await kv
      .set(cacheKey, data, DATASETS_CACHE.SHARED_MAX_AGE)
      .catch(() => {});
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (_err) {
    const stale = await kv.get<unknown>(cacheKey);
    if (stale != null) {
      const revalidated = spec.schema.safeParse(stale);
      if (revalidated.success) {
        const h = new Headers(responseHeaders);
        h.set("X-Cache", "STALE");
        return new Response(JSON.stringify(revalidated.data), {
          status: 200,
          headers: h,
        });
      }
    }
    return errorResponse("Upstream unavailable", 502);
  }
}
