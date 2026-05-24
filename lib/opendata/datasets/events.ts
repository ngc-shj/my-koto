// Events dataset (Tokyo Open Data, 江東区).

import { DATASETS } from "@/config/opendata";
import {
  EventResponseSchema,
  type EventResponse,
} from "@/lib/opendata/schemas/events";
import { parseCsv, type CsvRow } from "@/lib/csv";
import {
  loadCsvRows,
  ckanResolveAndCheck,
  fetchCsvText,
  type ConditionalLoadResult,
} from "./source";

// Normalise "YYYY/M/D" / "YYYY-M-D" / "YYYY-MM-D" → "YYYY-MM-DD". The
// Koto event CSV mixes `-` and `/` separators and drops zero-padding on
// some rows, which breaks the strict EventSchema regex
// (lib/events/types.ts) downstream.
export function normalizeIsoDate(raw: string | undefined): string {
  if (!raw) return "";
  const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(raw.trim());
  if (!m) return raw;
  const [, y, mo, d] = m;
  return `${y}-${mo!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
}

function pickHttpsUrl(...candidates: (string | undefined)[]): string | undefined {
  for (const v of candidates) {
    if (!v) continue;
    try {
      if (new URL(v).protocol === "https:") return v;
    } catch {
      /* skip malformed */
    }
  }
  return undefined;
}

export function toEventRecord(row: CsvRow): Record<string, string | undefined> {
  const start = normalizeIsoDate(row["開始日"]);
  const endRaw = row["終了日"];
  return {
    名称: row["イベント名"] ?? "",
    開始日: start,
    終了日: endRaw ? normalizeIsoDate(endRaw) : undefined,
    場所: row["場所名称"] || undefined,
    住所: row["所在地_連結表記"] || undefined,
    説明: row["説明"] || row["概要"] || undefined,
    URL: pickHttpsUrl(row["URL"], row["コンテンツURL"]),
    主催: row["主催者"] || undefined,
    備考: row["備考"] || undefined,
  };
}

// Drop rows where 開始日 is blank — historical drafts the city never
// published. The strict EventSchema regex downstream would otherwise
// reject the whole payload on a single bad row.
function buildEventsResponse(rows: readonly CsvRow[]): EventResponse {
  const records = rows
    .map(toEventRecord)
    .filter((r) => typeof r.開始日 === "string" && r.開始日.length > 0);
  return EventResponseSchema.parse({ result: { records } });
}

export async function fetchEventsDataset(): Promise<EventResponse> {
  const rows = await loadCsvRows({
    datasetId: DATASETS.events,
    resourcePattern: /event.*\.csv$/i,
    encoding: "utf-8",
  });
  return buildEventsResponse(rows);
}

export async function fetchEventsDatasetConditional(
  prevVersion: string | undefined,
): Promise<ConditionalLoadResult<EventResponse>> {
  const resolved = await ckanResolveAndCheck(
    DATASETS.events,
    /event.*\.csv$/i,
    prevVersion,
  );
  if (resolved.unchanged) return { unchanged: true, version: resolved.version };
  const text = await fetchCsvText(resolved.url, "utf-8");
  return {
    unchanged: false,
    data: buildEventsResponse(parseCsv(text)),
    version: resolved.version,
  };
}
