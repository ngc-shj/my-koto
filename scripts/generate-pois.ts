// Build data/aed.json and data/toilet.json from official Koto-ku open data CSVs.
//
// Sources (CC-BY 4.0, 東京都・江東区):
// - https://www.city.koto.lg.jp/012107/documents/131083_aed.csv (UTF-8 BOM)
// - https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_toilet.csv (Shift_JIS)
//
// Run via: `npx tsx scripts/generate-pois.ts`. The TS form lets us import
// `lib/csv.ts` directly so the parser cannot drift from the test-locked
// canonical implementation (T-02 / F-15).

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { parseCsv } from "../lib/csv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FIXTURE_DIR = join(ROOT, "__fixtures__", "opendata");

type SourceSpec = {
  url: string;
  cache: string;
  out: string;
  encoding: "utf-8" | "shift-jis";
  parser: "aed" | "toilet";
};

const SOURCES: Record<"aed" | "toilet", SourceSpec> = {
  aed: {
    url: "https://www.city.koto.lg.jp/012107/documents/131083_aed.csv",
    cache: join(FIXTURE_DIR, "koto-aed.csv"),
    out: join(ROOT, "data", "aed.json"),
    encoding: "utf-8",
    parser: "aed",
  },
  toilet: {
    url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_toilet.csv",
    cache: join(FIXTURE_DIR, "koto-toilet.csv"),
    out: join(ROOT, "data", "toilet.json"),
    encoding: "shift-jis",
    parser: "toilet",
  },
};

async function loadCsv(src: SourceSpec): Promise<string> {
  try {
    const cached = await readFile(src.cache, "utf8");
    if (cached.length > 0) return cached;
  } catch {
    /* fall through */
  }
  console.log(`Fetching ${src.url}`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const decoder = new TextDecoder(src.encoding);
  const text = decoder.decode(buf).replace(/^﻿/, "");
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(src.cache, text, "utf8");
  return text;
}

function isFiniteNumber(s: string | undefined): boolean {
  if (!s) return false;
  const n = Number(s);
  return Number.isFinite(n);
}

function makeAedRecord(row: Record<string, string>) {
  return {
    名称: row["名称"] ?? "",
    住所: row["所在地_連結表記"] || row["所在地"] || "",
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    設置場所詳細: row["設置位置"] ?? "",
    利用可能時間: [row["開始時間"], row["終了時間"]]
      .filter(Boolean)
      .join("-")
      .replace(/:00$/g, "")
      .replace(/:00-/g, "-"),
    電話番号: row["電話番号"] ?? "",
    備考: row["利用可能日時特記事項"] || row["備考"] || "",
  };
}

function truthy(v: string | undefined): "有" | "" {
  return v === "有" || v === "○" ? "有" : "";
}

function makeToiletRecord(row: Record<string, string>) {
  return {
    名称: row["名称"] ?? "",
    住所: row["住所"] ?? "",
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    バリアフリー: truthy(row["車椅子使用者用トイレ有無"]),
    二十四時間:
      row["利用開始時間"] === "0:00" && row["利用終了時間"] === "23:59"
        ? "有"
        : "",
    備考: row["備考"] ?? "",
  };
}

async function buildAed(): Promise<void> {
  const src = SOURCES.aed;
  const text = await loadCsv(src);
  const rows = parseCsv(text).filter(
    (r) => isFiniteNumber(r["緯度"]) && isFiniteNumber(r["経度"]),
  );
  const records = rows.map(makeAedRecord);
  const payload = { result: { records } };
  await writeFile(src.out, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${records.length} records to ${src.out}`);
}

async function buildToilet(): Promise<void> {
  const src = SOURCES.toilet;
  const text = await loadCsv(src);
  const rows = parseCsv(text).filter(
    (r) => isFiniteNumber(r["緯度"]) && isFiniteNumber(r["経度"]),
  );
  const records = rows.map(makeToiletRecord);
  const payload = { result: { records } };
  await writeFile(src.out, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${records.length} records to ${src.out}`);
}

async function main(): Promise<void> {
  // tsx + esbuild compile this to CJS by default (package.json has no
  // "type": "module"), and CJS does not allow top-level await — F-17.
  // Wrapping the entry points in a `main()` keeps the .ts form runnable
  // via `npx tsx scripts/generate-pois.ts` like the sibling scripts.
  await buildAed();
  await buildToilet();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
