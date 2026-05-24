// AED dataset (Tokyo Open Data, 江東区) — fetches the CKAN-resolved CSV
// and maps the rich GLM columns down to the minimal {result:{records:[…]}}
// envelope the rest of the app validates against.

import { DATASETS } from "@/config/opendata";
import {
  AedResponseSchema,
  type AedResponse,
} from "@/lib/opendata/schemas/aed";
import { parseCsv, type CsvRow } from "@/lib/csv";
import {
  loadCsvRows,
  isFiniteNumberString,
  ckanResolveAndCheck,
  fetchCsvText,
  type ConditionalLoadResult,
} from "./source";

export function toAedRecord(row: CsvRow): Record<string, string> {
  // Hours: "HH:MM-HH:MM" from start/end when both populated; otherwise
  // omit. Free-text restrictions live in 備考.
  const start = (row["開始時間"] ?? "").replace(/:00$/, "");
  const end = (row["終了時間"] ?? "").replace(/:00$/, "");
  const hours = start && end ? `${start}-${end}` : "";
  return {
    名称: row["名称"] ?? "",
    住所: row["所在地_連結表記"] ?? "",
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    設置場所詳細: row["設置位置"] ?? "",
    利用可能時間: hours,
    電話番号: row["電話番号"] ?? "",
    備考: row["利用可能日時特記事項"] || row["備考"] || "",
  };
}

function buildAedResponse(rows: readonly CsvRow[]): AedResponse {
  const records = rows
    .filter(
      (r) => isFiniteNumberString(r["緯度"]) && isFiniteNumberString(r["経度"]),
    )
    .map(toAedRecord);
  return AedResponseSchema.parse({ result: { records } });
}

export async function fetchAedDataset(): Promise<AedResponse> {
  const rows = await loadCsvRows({
    datasetId: DATASETS.aed,
    resourcePattern: /aed.*\.csv$/i,
    encoding: "utf-8",
  });
  return buildAedResponse(rows);
}

// Conditional variant: CKAN `metadata_modified` is consulted first;
// when it matches `prevVersion`, the CSV is not re-fetched at all.
export async function fetchAedDatasetConditional(
  prevVersion: string | undefined,
): Promise<ConditionalLoadResult<AedResponse>> {
  const resolved = await ckanResolveAndCheck(
    DATASETS.aed,
    /aed.*\.csv$/i,
    prevVersion,
  );
  if (resolved.unchanged) {
    return { unchanged: true, version: resolved.version };
  }
  const text = await fetchCsvText(resolved.url, "utf-8");
  return {
    unchanged: false,
    data: buildAedResponse(parseCsv(text)),
    version: resolved.version,
  };
}
