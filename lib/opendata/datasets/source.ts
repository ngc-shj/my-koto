// Edge-runtime-safe building blocks for fetching Tokyo Open Data CKAN
// datasets and parsing the underlying CSVs. The four per-dataset modules
// (aed/toilet/events/gomi) compose these helpers with their own column
// mappers and dataset IDs.
//
// Constraints honoured:
//   - No Node-only APIs (Buffer, fs). Uses Uint8Array + TextDecoder so
//     the same code runs inside `/api/datasets/*` Edge handlers.
//   - Upstream calls go through redirect:'manual' + AbortSignal so SSRF
//     and runaway requests are bounded.

import { TOKYO_OPEN_DATA_CKAN_API } from "@/config/opendata";
import { parseCsv, type CsvRow } from "@/lib/csv";
import { PRODUCT_UA } from "@/lib/upstream/ua";

export type CsvEncoding = "utf-8" | "shift-jis";

// The dataset-level conditional result every per-source loader returns.
// `version` is whatever freshness token the loader produces (CKAN
// metadata_modified, the CSV's Last-Modified, etc.) — opaque to the
// caller; only compared for equality.
export type ConditionalLoadResult<T> =
  | { readonly unchanged: true; readonly version: string }
  | { readonly unchanged: false; readonly data: T; readonly version: string };

// Per-call timeout. Long enough for cold CKAN responses, short enough that
// a stuck upstream does not pin Edge invocation budget.
const UPSTREAM_TIMEOUT_MS = 10_000;

// Resolve the current CSV resource URL for a CKAN dataset. The catalog
// rotates resource filenames per refresh, so the URL must be looked up
// per call rather than hardcoded.
export async function ckanResolveCsvUrl(
  datasetId: string,
  pattern: RegExp,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `${TOKYO_OPEN_DATA_CKAN_API}?id=${encodeURIComponent(datasetId)}`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": PRODUCT_UA, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status} for ${datasetId}`);
  const body = (await res.json()) as {
    result?: { resources?: Array<{ url?: string }> };
  };
  const target = body.result?.resources?.find(
    (r) => typeof r.url === "string" && pattern.test(r.url),
  );
  if (!target?.url) {
    throw new Error(
      `CKAN ${datasetId}: no resource matched ${pattern.source}`,
    );
  }
  return target.url;
}

// Fetch the CSV body and decode with the requested encoding. The UTF-8
// BOM is stripped so the parser does not treat it as part of the first
// header cell.
export async function fetchCsvText(
  url: string,
  encoding: CsvEncoding,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": PRODUCT_UA },
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder(encoding).decode(buf).replace(/^﻿/, "");
}

// Conditional CSV fetch. When `prev` is non-null and the upstream still
// has the same body (304 Not Modified), returns `{ unchanged: true }`
// without re-decoding or re-parsing. On 200 returns the new body plus
// the freshness headers callers should record for the next round trip.
export type ConditionalHeaders = {
  readonly etag?: string;
  readonly lastModified?: string;
};

export type ConditionalCsvResult =
  | { readonly unchanged: true }
  | {
      readonly unchanged: false;
      readonly text: string;
      readonly headers: ConditionalHeaders;
    };

export async function fetchCsvTextConditional(
  url: string,
  encoding: CsvEncoding,
  prev: ConditionalHeaders,
  fetchImpl: typeof fetch = fetch,
): Promise<ConditionalCsvResult> {
  const headers = new Headers({ "User-Agent": PRODUCT_UA });
  if (prev.etag) headers.set("If-None-Match", prev.etag);
  if (prev.lastModified) headers.set("If-Modified-Since", prev.lastModified);
  const res = await fetchImpl(url, {
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (res.status === 304) return { unchanged: true };
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder(encoding).decode(buf).replace(/^﻿/, "");
  return {
    unchanged: false,
    text,
    headers: {
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
    },
  };
}

// Resolve via CKAN, then HEAD or conditionally GET the resource. Returns
// a version string callers can store as freshness baseline (the CSV's
// own ETag/Last-Modified). Falls back to "" if upstream exposes neither
// — in that case Conditional fetch becomes a no-op (always 200).
export type CkanResolved = {
  readonly url: string;
  readonly version: string;
};

// CKAN datasets carry a `metadata_modified` field that bumps whenever
// the resource is republished — perfect freshness signal that costs a
// single JSON request. We ask for it first, and only resolve+fetch the
// CSV if it differs from the prior version.
export async function ckanResolveAndCheck(
  datasetId: string,
  resourcePattern: RegExp,
  prevVersion: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<
  | { unchanged: true; version: string }
  | { unchanged: false; url: string; version: string }
> {
  const url = `${TOKYO_OPEN_DATA_CKAN_API}?id=${encodeURIComponent(datasetId)}`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": PRODUCT_UA, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status} for ${datasetId}`);
  const body = (await res.json()) as {
    result?: {
      metadata_modified?: string;
      resources?: Array<{ url?: string }>;
    };
  };
  const version = body.result?.metadata_modified ?? "";
  if (prevVersion && version && version === prevVersion) {
    return { unchanged: true, version };
  }
  const resource = body.result?.resources?.find(
    (r) => typeof r.url === "string" && resourcePattern.test(r.url),
  );
  if (!resource?.url) {
    throw new Error(
      `CKAN ${datasetId}: no resource matched ${resourcePattern.source}`,
    );
  }
  return { unchanged: false, url: resource.url, version };
}

// Convenience: resolve + fetch + parse, returning the row array. Callers
// then map rows to their schema-shaped records.
export async function loadCsvRows(args: {
  datasetId: string;
  resourcePattern: RegExp;
  encoding: CsvEncoding;
}): Promise<CsvRow[]> {
  const url = await ckanResolveCsvUrl(args.datasetId, args.resourcePattern);
  const text = await fetchCsvText(url, args.encoding);
  return parseCsv(text);
}

export function isFiniteNumberString(v: string | undefined): boolean {
  if (!v) return false;
  return Number.isFinite(Number(v));
}
