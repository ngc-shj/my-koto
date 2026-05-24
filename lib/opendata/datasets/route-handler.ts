// Per-dataset route handler used by /api/datasets/* and (going forward)
// any other surface that needs to ship a snapshot to the browser. The
// upstream work has moved off the request path entirely — `ensure-data`
// (Cron) populates the libsql snapshot; this handler only reads from
// it, derives an ETag from the `_meta.version` of the source, and lets
// browsers short-circuit with 304 Not Modified.

import type { NextRequest } from "next/server";
import type { Client } from "@libsql/client";
import { DATASETS_CACHE } from "@/config/cache";
import {
  getAllowedOrigin,
  jsonResponseHeaders,
  rateLimitResponse,
} from "@/lib/api-shared";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readMetaVersion } from "@/lib/opendata/db/readers";

export type DatasetRouteSpec<T> = {
  // Rate-limit bucket + identifier in the _meta table.
  key: string;
  // SELECT from libsql and return the schema-shaped payload.
  read: (db: Client) => Promise<T>;
};

function errorResponse(message: string, status: number): Response {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

// SHA-1-style ETag would need crypto; the libsql version string is
// already a content-addressable token (CKAN metadata_modified), so we
// just wrap it.
function etagOf(version: string | undefined): string {
  return version ? `W/"${version}"` : `W/"empty"`;
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

  try {
    const db = openDatasetsDb();
    const version = await readMetaVersion(db, spec.key);
    const etag = etagOf(version);
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch && ifNoneMatch === etag) {
      // Browser already has this snapshot; skip both the SQL read and
      // the body serialisation.
      const h = new Headers(responseHeaders);
      h.set("ETag", etag);
      h.set("X-Cache", "BROWSER-304");
      return new Response(null, { status: 304, headers: h });
    }
    const data = await spec.read(db);
    const h = new Headers(responseHeaders);
    h.set("ETag", etag);
    return new Response(JSON.stringify(data), { status: 200, headers: h });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(`Dataset unavailable: ${msg}`, 503);
  }
}
