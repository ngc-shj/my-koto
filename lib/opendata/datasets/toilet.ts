// Public toilet dataset (Tokyo Open Data, 江東区).

import { DATASETS } from "@/config/opendata";
import {
  ToiletResponseSchema,
  type ToiletResponse,
} from "@/lib/opendata/schemas/toilet";
import { parseCsv, type CsvRow } from "@/lib/csv";
import {
  loadCsvRows,
  isFiniteNumberString,
  ckanResolveAndCheck,
  fetchCsvText,
  type ConditionalLoadResult,
} from "./source";

function truthy(v: string | undefined): "有" | "" {
  return v === "有" || v === "○" || v === "1" ? "有" : "";
}

function hasCount(v: string | undefined): "有" | "" {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? "有" : "";
}

export function toToiletRecord(row: CsvRow): Record<string, string> {
  const open = row["利用開始時間"] ?? "";
  const close = row["利用終了時間"] ?? "";
  const isAllDay =
    (open === "0:00" || open === "00:00") &&
    (close === "23:59" || close === "23:59:59");
  return {
    名称: row["名称"] ?? "",
    住所: row["所在地_連結表記"] ?? "",
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    バリアフリー: truthy(row["車椅子使用者用トイレ有無"]),
    二十四時間: isAllDay ? "有" : "",
    男性用: hasCount(row["男性トイレ総数"]),
    女性用: hasCount(row["女性トイレ総数"]),
    多目的: hasCount(row["バリアフリートイレ数"]),
    備考: row["備考"] ?? "",
  };
}

function buildToiletResponse(rows: readonly CsvRow[]): ToiletResponse {
  const records = rows
    .filter(
      (r) => isFiniteNumberString(r["緯度"]) && isFiniteNumberString(r["経度"]),
    )
    .map(toToiletRecord);
  return ToiletResponseSchema.parse({ result: { records } });
}

export async function fetchToiletDataset(): Promise<ToiletResponse> {
  const rows = await loadCsvRows({
    datasetId: DATASETS.toilet,
    resourcePattern: /toilet.*\.csv$/i,
    encoding: "utf-8",
  });
  return buildToiletResponse(rows);
}

export async function fetchToiletDatasetConditional(
  prevVersion: string | undefined,
): Promise<ConditionalLoadResult<ToiletResponse>> {
  const resolved = await ckanResolveAndCheck(
    DATASETS.toilet,
    /toilet.*\.csv$/i,
    prevVersion,
  );
  if (resolved.unchanged) return { unchanged: true, version: resolved.version };
  const text = await fetchCsvText(resolved.url, "utf-8");
  return {
    unchanged: false,
    data: buildToiletResponse(parseCsv(text)),
    version: resolved.version,
  };
}
