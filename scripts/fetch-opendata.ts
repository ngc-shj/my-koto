/**
 * Fetches open data from the Tokyo Open Data Catalog (CKAN) and saves to
 * data/*.json. Run via: npx tsx scripts/fetch-opendata.ts
 *
 * Data path: CKAN package_show → resource CSV URL → fetch CSV → map columns
 * down to the legacy `{ result: { records: [...] } }` envelope so the app
 * schemas (and every consumer in lib/map, app/events, app/page) continue
 * to validate unchanged. The previous endpoint
 * (`service.api.metro.tokyo.lg.jp/v1/dataset/...`) was retired in 2026.
 *
 * On schema validation failure:
 *   - Existing data/*.json is NOT overwritten.
 *   - Discord webhook is called (if DISCORD_WEBHOOK is set).
 *   - Process exits with code 1.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { z } from "zod";
import {
  DATASETS,
  TOKYO_OPEN_DATA_CKAN_API,
  WBGT_BASE_URL,
  WBGT_STATION_CODE,
} from "@/config/opendata";
import { AedResponseSchema } from "@/lib/opendata/schemas/aed";
import { ToiletResponseSchema } from "@/lib/opendata/schemas/toilet";
import { GomiResponseSchema, type Weekday } from "@/lib/opendata/schemas/gomi";
import { EventResponseSchema } from "@/lib/opendata/schemas/events";
import { WbgtDataSchema } from "@/lib/opendata/schemas/wbgt";
import { parseCsv, type CsvRow } from "@/lib/csv";

const DATA_DIR = join(process.cwd(), "data");
const USER_AGENT =
  process.env["UA_OVERRIDE"] ??
  "koto-city-bot/1.0 (+https://example.com/about)";

// Sends a Discord notification if DISCORD_WEBHOOK env var is set.
// Exported to allow injection in tests.
export async function notifyDiscord(message: string): Promise<void> {
  const webhookUrl = process.env["DISCORD_WEBHOOK"];
  if (!webhookUrl) return;

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  });
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validates data against a Zod schema, then persists to outputPath.
 * If validation fails, the existing file is NOT overwritten and the
 * provided discord notifier is called with an error message.
 *
 * Returns { ok: false } without throwing so callers can collect all errors.
 */
export async function validateAndPersist<T>(
  data: unknown,
  schema: z.ZodType<T>,
  outputPath: string,
  discordNotifier: (msg: string) => Promise<void> = notifyDiscord
): Promise<ValidationResult> {
  const result = schema.safeParse(data);

  if (!result.success) {
    const errorSummary = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");

    const message = `[koto-city] Schema validation failed for ${outputPath}: ${errorSummary}`;
    console.error(message);
    await discordNotifier(message);

    return { ok: false, reason: errorSummary };
  }

  writeFileSync(outputPath, JSON.stringify(result.data, null, 2) + "\n", "utf-8");
  console.log(`Saved: ${outputPath}`);
  return { ok: true };
}

// CKAN package_show → first resource URL matching pattern. The catalog
// rolls resource filenames per refresh, so URLs are resolved at fetch
// time rather than hardcoded.
export async function ckanResolveCsvUrl(
  datasetId: string,
  pattern: RegExp,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const url = `${TOKYO_OPEN_DATA_CKAN_API}?id=${encodeURIComponent(datasetId)}`;
  const res = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
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

// Fetches the CSV body and decodes with the requested encoding. UTF-8 BOM
// is stripped because the parser would treat it as part of the first
// header cell otherwise.
export async function fetchCsvText(
  url: string,
  encoding: "utf-8" | "shift-jis",
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return new TextDecoder(encoding).decode(buf).replace(/^﻿/, "");
}

// Exported pure parser for the WBGT CSV (T-03). Input is the full body.
// Drops the header row, ignores blank lines, and rejects rows missing a
// datetime or whose WBGT value is not a finite number.
export function parseWbgtCsv(
  csv: string,
  station = "東京",
): Array<{ station: string; datetime: string; wbgt: number }> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  return lines
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split(",");
      const datetime = parts[0]?.trim() ?? "";
      const wbgt = parseFloat(parts[1]?.trim() ?? "");
      if (!datetime || !Number.isFinite(wbgt)) return null;
      return { station, datetime, wbgt };
    })
    .filter((r): r is { station: string; datetime: string; wbgt: number } =>
      r !== null,
    );
}

// ---------------------------------------------------------------------------
// Per-dataset row mappers — collapse the rich CKAN columns down to the
// minimal shape the app schemas validate. Field names are kept identical
// to the legacy `service.api.metro.tokyo.lg.jp` payload so consumers in
// lib/map/, app/events/, app/page.tsx need no change.
// ---------------------------------------------------------------------------

export function toAedRecord(row: CsvRow): Record<string, string> {
  // Hours: "HH:MM-HH:MM" from start/end when both are populated; otherwise
  // omit. Free-text restrictions live in 備考 below.
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

// ---------------------------------------------------------------------------
// Task runner — one entry per source.
// ---------------------------------------------------------------------------

type DatasetSpec<T> = {
  name: string;
  datasetId: string;
  resourcePattern: RegExp;
  encoding: "utf-8" | "shift-jis";
  requireCoords: boolean;
  mapper: (row: CsvRow) => unknown;
  schema: z.ZodType<T>;
  outputPath: string;
};

function isFiniteNumberString(v: string | undefined): boolean {
  if (!v) return false;
  return Number.isFinite(Number(v));
}

async function syncDataset<T>(spec: DatasetSpec<T>): Promise<void> {
  const url = await ckanResolveCsvUrl(spec.datasetId, spec.resourcePattern);
  const csv = await fetchCsvText(url, spec.encoding);
  const rows = parseCsv(csv);
  const filtered = spec.requireCoords
    ? rows.filter(
        (r) =>
          isFiniteNumberString(r["緯度"]) && isFiniteNumberString(r["経度"]),
      )
    : rows;
  const records = filtered.map(spec.mapper);
  const payload = { result: { records } };
  await validateAndPersist(payload, spec.schema, spec.outputPath);
}

async function fetchAed(): Promise<void> {
  await syncDataset({
    name: "AED",
    datasetId: DATASETS.aed,
    resourcePattern: /aed.*\.csv$/i,
    encoding: "utf-8",
    requireCoords: true,
    mapper: toAedRecord,
    schema: AedResponseSchema,
    outputPath: join(DATA_DIR, "aed.json"),
  });
}

async function fetchToilet(): Promise<void> {
  await syncDataset({
    name: "Toilet",
    datasetId: DATASETS.toilet,
    resourcePattern: /toilet.*\.csv$/i,
    encoding: "utf-8",
    requireCoords: true,
    mapper: toToiletRecord,
    schema: ToiletResponseSchema,
    outputPath: join(DATA_DIR, "toilet.json"),
  });
}

async function fetchGomi(): Promise<void> {
  await syncDataset({
    name: "Gomi",
    datasetId: DATASETS.gomi,
    resourcePattern: /\.csv$/i,
    encoding: "shift-jis",
    requireCoords: false,
    mapper: toGomiRecord,
    schema: GomiResponseSchema,
    outputPath: join(DATA_DIR, "gomi.json"),
  });
}

async function fetchEvents(): Promise<void> {
  // Some upstream rows ship without 開始日 — historical drafts that the
  // city never published. Drop them at the source so /api/ics/events and
  // the strict EventSchema regex don't blow up on a blank date.
  const url = await ckanResolveCsvUrl(DATASETS.events, /event.*\.csv$/i);
  const csv = await fetchCsvText(url, "utf-8");
  const records = parseCsv(csv)
    .map(toEventRecord)
    .filter((r) => typeof r.開始日 === "string" && r.開始日.length > 0);
  await validateAndPersist(
    { result: { records } },
    EventResponseSchema,
    join(DATA_DIR, "events.json"),
  );
}

async function fetchWbgt(): Promise<void> {
  // Ministry of Environment WBGT CSV download for Tokyo observation point.
  const url = `${WBGT_BASE_URL}/wbgt_data.php?pd=today&obs=${WBGT_STATION_CODE}&format=csv`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`WBGT fetch failed: HTTP ${res.status}`);
  }

  const csv = await res.text();
  const readings = parseWbgtCsv(csv);

  const wbgtData = {
    fetchedAt: new Date().toISOString(),
    readings,
  };

  await validateAndPersist(wbgtData, WbgtDataSchema, join(DATA_DIR, "wbgt.json"));
}

async function main(): Promise<void> {
  const tasks: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: "AED", fn: fetchAed },
    { name: "Toilet", fn: fetchToilet },
    { name: "Gomi", fn: fetchGomi },
    { name: "Events", fn: fetchEvents },
    { name: "WBGT", fn: fetchWbgt },
  ];

  let hasError = false;

  for (const task of tasks) {
    try {
      await task.fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${task.name}] Fetch error: ${message}`);
      await notifyDiscord(`[koto-city] Fetch failed for ${task.name}: ${message}`);
      hasError = true;
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

// Only execute when run directly (not when imported in tests).
if (process.argv[1] && process.argv[1].endsWith("fetch-opendata.ts")) {
  main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
