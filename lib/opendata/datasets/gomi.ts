// Gomi (waste collection schedule) dataset (Tokyo Open Data, 江東区).
// The upstream CSV is Shift_JIS encoded — the only one of the four.

import { DATASETS } from "@/config/opendata";
import {
  GomiResponseSchema,
  type GomiResponse,
  type Weekday,
} from "@/lib/opendata/schemas/gomi";
import { parseCsv, type CsvRow } from "@/lib/csv";
import {
  loadCsvRows,
  ckanResolveAndCheck,
  fetchCsvText,
  type ConditionalLoadResult,
} from "./source";

const WEEKDAY_MAP: Record<string, Weekday> = {
  月: "mon",
  火: "tue",
  水: "wed",
  木: "thu",
  金: "fri",
  土: "sat",
  日: "sun",
};

// Parses cells like "月・木", "（隔週）土", "水" into a Weekday array. The
// 隔週/(every-other-week) qualifier is dropped — the schema has no concept
// of cadence and the UI just lists days. Unknown characters are skipped.
export function parseWeekdays(raw: string | undefined): Weekday[] {
  if (!raw) return [];
  const cleaned = raw.replace(/[(（].*?[）)]/g, "");
  const days: Weekday[] = [];
  for (const ch of cleaned) {
    const day = WEEKDAY_MAP[ch];
    if (day && !days.includes(day)) days.push(day);
  }
  return days;
}

export function toGomiRecord(row: CsvRow): Record<string, unknown> {
  return {
    地区ID: row["地区番号"] ?? "",
    地区名: row["住所"] ?? "",
    燃やすごみ: parseWeekdays(row["燃やすごみ"]),
    燃やさないごみ: parseWeekdays(row["燃やさないごみ"]),
    プラスチック: parseWeekdays(row["プラスチック"]),
    資源ごみ: parseWeekdays(row["資源"]),
  };
}

function buildGomiResponse(rows: readonly CsvRow[]): GomiResponse {
  const records = rows.map(toGomiRecord);
  return GomiResponseSchema.parse({ result: { records } });
}

export async function fetchGomiDataset(): Promise<GomiResponse> {
  const rows = await loadCsvRows({
    datasetId: DATASETS.gomi,
    resourcePattern: /\.csv$/i,
    encoding: "shift-jis",
  });
  return buildGomiResponse(rows);
}

export async function fetchGomiDatasetConditional(
  prevVersion: string | undefined,
): Promise<ConditionalLoadResult<GomiResponse>> {
  const resolved = await ckanResolveAndCheck(
    DATASETS.gomi,
    /\.csv$/i,
    prevVersion,
  );
  if (resolved.unchanged) return { unchanged: true, version: resolved.version };
  const text = await fetchCsvText(resolved.url, "shift-jis");
  return {
    unchanged: false,
    data: buildGomiResponse(parseCsv(text)),
    version: resolved.version,
  };
}
