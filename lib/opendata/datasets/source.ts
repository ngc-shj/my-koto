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

export type CsvEncoding = "utf-8" | "shift-jis";

export const DATASETS_USER_AGENT = "koto-city/1.0 (+/about)";

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
    headers: { "User-Agent": DATASETS_USER_AGENT, Accept: "application/json" },
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
    headers: { "User-Agent": DATASETS_USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder(encoding).decode(buf).replace(/^﻿/, "");
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
