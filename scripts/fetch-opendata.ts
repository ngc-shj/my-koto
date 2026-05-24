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
import {
  WbgtDataSchema,
  type WbgtReading,
} from "@/lib/opendata/schemas/wbgt";
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

// Parses the 環境省 month-bucketed observation CSV (`wbgt_<station>_YYYYMM.csv`):
//
//   Date,Time,<station>
//   2026/5/1,1:00,10.6
//   2026/5/1,2:00,10.6
//   ...
//   2026/5/24,20:00,            <- future hours come back blank; we skip them
//
// Values are in °C (already decimal, no tenths-conversion needed). The
// observation feed runs 4/23 → 10/22 only; outside that window the
// upstream returns 404 and the task is skipped silently.
export function parseWbgtObservationCsv(
  csv: string,
  station: string,
): WbgtReading[] {
  const rows = parseCsv(csv);
  const out: WbgtReading[] = [];
  for (const r of rows) {
    const date = (r["Date"] ?? "").trim();
    const time = (r["Time"] ?? "").trim();
    const raw = (r[station] ?? "").trim();
    if (!date || !time || !raw) continue;
    const wbgt = Number(raw);
    if (!Number.isFinite(wbgt)) continue;
    const iso = toIsoDatetimeJst(date, time);
    if (iso == null) continue;
    out.push({ station, datetime: iso, wbgt });
  }
  return out;
}

// "2026/5/24" + "13:00" → "2026-05-24T13:00:00+09:00". Hour "24:00" means
// midnight of the next day (環境省 uses 24-hour wrap), so shift the date
// forward by one and emit "T00:00".
export function toIsoDatetimeJst(date: string, time: string): string | null {
  const dm = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(date);
  const tm = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const [, y, mo, d] = dm;
  const [, hh, mm] = tm;
  const hour = Number(hh);
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) return null;
  const pad = (n: string | number) => String(n).padStart(2, "0");
  if (hour === 24) {
    const dt = new Date(Date.UTC(Number(y), Number(mo!) - 1, Number(d)));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}T00:${mm}:00+09:00`;
  }
  return `${y}-${pad(mo!)}-${pad(d!)}T${pad(hh!)}:${mm}:00+09:00`;
}

function currentMonthJst(now: Date = new Date()): string {
  // YYYYMM for JST. The workflow runs at 18:00 UTC (= 03:00 JST), so the
  // shift always lands inside the JST day; computing in UTC + offset is
  // fine for naming purposes.
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  return `${jst.getUTCFullYear()}${String(jst.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function fetchWbgt(): Promise<void> {
  // Documented in R08_wbgt_data_service_manual.pdf: observations live at
  // /est15WG/dl/wbgt_<station>_<YYYYMM>.csv, regenerated hourly during
  // the 4/23 → 10/22 operating window.
  const url = `${WBGT_BASE_URL}/est15WG/dl/wbgt_${WBGT_STATION_CODE}_${currentMonthJst()}.csv`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) {
    // Off-season (outside 4/23–10/22) — upstream has no file. Nothing to
    // refresh; leave the existing data/wbgt.json (last in-season snapshot)
    // in place.
    console.log(`Skipped: WBGT observation file not published yet (${url})`);
    return;
  }
  if (!res.ok) throw new Error(`WBGT fetch failed: HTTP ${res.status}`);
  const csv = await res.text();
  const readings = parseWbgtObservationCsv(csv, WBGT_STATION_CODE);
  // Anchor fetchedAt to the latest reading rather than wall-clock so the
  // file only changes when the upstream actually published a new hour —
  // otherwise the daily cron produces a timestamp-only PR every run.
  const fetchedAt =
    readings.length > 0
      ? (readings[readings.length - 1]?.datetime ?? new Date().toISOString())
      : new Date().toISOString();
  await validateAndPersist(
    { fetchedAt, readings },
    WbgtDataSchema,
    join(DATA_DIR, "wbgt.json"),
  );
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
