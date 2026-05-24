// Build data/<layer>.json from upstream CSVs.
//
// AED and 公衆トイレ are no longer handled here — they moved to live
// Edge routes (`/api/datasets/{aed,toilet}`) backed by Tokyo Met CKAN
// resources, and the mappers in `lib/opendata/datasets/{aed,toilet}.ts`
// supersede the ones that lived here.
//
// Sources still owned by this script:
// - 東京都 避難所:  CKAN dataset t000003d0000000093 → evacuation_center.csv (Shift_JIS)
// - 東京都 避難場所: CKAN dataset t000003d0000000093 → evacuation_area.csv (UTF-8 BOM)
// - 東京都 給水拠点: CKAN dataset t000019d0000000001 (Shift_JIS, filename rolls per release)
//
// Tokyo Met datasets ship under filenames that change with each refresh
// (`kyoten_20251211.csv`), so the script resolves the current resource URL
// from the CKAN API at run time. License for every source: CC-BY 4.0.
//
// Run via: `npx tsx scripts/generate-pois.ts`. The TS form lets us import
// `lib/csv.ts` directly so the parser cannot drift from the test-locked
// canonical implementation.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { parseCsv } from "../lib/csv.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const FIXTURE_DIR = join(ROOT, "__fixtures__", "opendata");
const CKAN_API = "https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_show";

type LayerKey =
  | "shelter"
  | "assembly_point"
  | "water_supply"
  | "park"
  | "library"
  | "child_center"
  | "nursery";

type SourceSpec = {
  // Either a fixed URL ('static') or a CKAN-resolved one ('ckan').
  // For 'ckan' we look up the dataset, then pick the first resource whose
  // URL pattern matches `resourcePattern`.
  resolve:
    | { kind: "static"; url: string }
    | { kind: "ckan"; datasetId: string; resourcePattern: RegExp };
  cache: string;
  out: string;
  encoding: "utf-8" | "shift-jis";
  parser: LayerKey;
};

const SOURCES: Record<LayerKey, SourceSpec> = {
  shelter: {
    resolve: {
      kind: "ckan",
      datasetId: "t000003d0000000093",
      resourcePattern: /evacuation_center\.csv$/i,
    },
    cache: join(FIXTURE_DIR, "tokyo-evacuation-center.csv"),
    out: join(ROOT, "data", "shelter.json"),
    encoding: "shift-jis",
    parser: "shelter",
  },
  assembly_point: {
    resolve: {
      kind: "ckan",
      datasetId: "t000003d0000000093",
      resourcePattern: /evacuation_area\.csv$/i,
    },
    cache: join(FIXTURE_DIR, "tokyo-evacuation-area.csv"),
    out: join(ROOT, "data", "assembly_point.json"),
    encoding: "utf-8",
    parser: "assembly_point",
  },
  water_supply: {
    resolve: {
      kind: "ckan",
      datasetId: "t000019d0000000001",
      // Filename is `kyoten_<yyyymmdd>.csv`, rolls each release.
      resourcePattern: /kyoten_\d+\.csv$/i,
    },
    cache: join(FIXTURE_DIR, "tokyo-water-supply.csv"),
    out: join(ROOT, "data", "water_supply.json"),
    encoding: "shift-jis",
    parser: "water_supply",
  },
  park: {
    resolve: {
      kind: "static",
      url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-17_parks.csv",
    },
    cache: join(FIXTURE_DIR, "koto-park.csv"),
    out: join(ROOT, "data", "park.json"),
    encoding: "shift-jis",
    parser: "park",
  },
  library: {
    resolve: {
      kind: "static",
      url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-25_libraries.csv",
    },
    cache: join(FIXTURE_DIR, "koto-library.csv"),
    out: join(ROOT, "data", "library.json"),
    encoding: "shift-jis",
    parser: "library",
  },
  child_center: {
    resolve: {
      kind: "static",
      url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-9_childrensclubhouses.csv",
    },
    cache: join(FIXTURE_DIR, "koto-child-center.csv"),
    out: join(ROOT, "data", "child_center.json"),
    encoding: "shift-jis",
    parser: "child_center",
  },
  nursery: {
    resolve: {
      kind: "static",
      // 区立 (municipal) only — private 認可 is published in a separate
      // CSV with looser data quality (PDF URLs in time fields). Phase 2
      // ships municipal nurseries first; private/認証/認可外 are tracked
      // for a follow-up if/when their schema stabilises.
      url: "https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_facility-10_municipal_childrens_daycare_centers.csv",
    },
    cache: join(FIXTURE_DIR, "koto-nursery.csv"),
    out: join(ROOT, "data", "nursery.json"),
    encoding: "shift-jis",
    parser: "nursery",
  },
};

async function resolveUrl(spec: SourceSpec): Promise<string> {
  if (spec.resolve.kind === "static") return spec.resolve.url;
  const { datasetId, resourcePattern } = spec.resolve;
  const apiUrl = `${CKAN_API}?id=${encodeURIComponent(datasetId)}`;
  const res = await fetch(apiUrl);
  if (!res.ok) throw new Error(`CKAN ${res.status} for ${datasetId}`);
  const body = (await res.json()) as {
    result?: { resources?: Array<{ url?: string }> };
  };
  const url = body.result?.resources?.find((r) =>
    typeof r.url === "string" && resourcePattern.test(r.url),
  )?.url;
  if (!url) {
    throw new Error(
      `CKAN dataset ${datasetId} returned no resource matching ${resourcePattern.source}`,
    );
  }
  return url;
}

async function loadCsv(src: SourceSpec): Promise<string> {
  try {
    const cached = await readFile(src.cache, "utf8");
    if (cached.length > 0) return cached;
  } catch {
    /* fall through */
  }
  const url = await resolveUrl(src);
  console.log(`Fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
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

// True when the row's address column starts with "東京都江東区" (or just
// "江東区"). The Tokyo Met feeds cover all 23 wards plus Tama region; we
// keep only Koto-ku rows so the bundled JSON stays small.
function isKotoRow(row: Record<string, string>, addressKey: string): boolean {
  const addr = row[addressKey] ?? "";
  return /(?:^|^東京都)江東区/.test(addr);
}

function pickFirst(row: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "") return v;
  }
  return "";
}

function makeShelterRecord(row: Record<string, string>) {
  // Column names vary slightly across Tokyo Met snapshots — the 避難所 file
  // has used both `避難所_施設名称` and `名称` historically.
  return {
    名称: pickFirst(row, ["避難所_施設名称", "名称", "施設名"]),
    住所: pickFirst(row, ["所在地住所", "住所", "所在地"]),
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    バリアフリー: anyTruthy(row, [
      "エレベーター有",
      "スロープ等",
      "点字ブロック",
      "車椅子使用者対応トイレ",
    ]),
    二十四時間: "",
    備考: pickFirst(row, ["その他", "備考"]),
  };
}

function makeAssemblyPointRecord(row: Record<string, string>) {
  return {
    名称: pickFirst(row, ["施設名", "名称", "避難所_施設名称"]),
    住所: pickFirst(row, ["所在地住所", "住所", "所在地"]),
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    洪水: row["洪水"] ?? "",
    崖崩れ: pickFirst(row, ["崖崩れ・土石流及び地滑り", "崖崩れ"]),
    高潮: row["高潮"] ?? "",
    地震: row["地震"] ?? "",
    津波: row["津波"] ?? "",
    大規模火災: pickFirst(row, ["大規模な火事", "大規模火災"]),
    内水氾濫: row["内水氾濫"] ?? "",
    火山現象: row["火山現象"] ?? "",
    バリアフリー: anyTruthy(row, [
      "エレベーター有",
      "スロープ等",
      "点字ブロック",
      "車椅子使用者対応トイレ",
    ]),
    備考: pickFirst(row, ["その他", "備考"]),
  };
}

function makeKotoFacilityRecord(row: Record<string, string>) {
  // Shared 38列 schema for 公園・図書館・児童館・保育園. Some Koto cells
  // contain trailing full-width spaces (e.g. URL); trim them once at the
  // boundary so downstream code sees clean strings.
  return {
    名称: (row["名称"] ?? "").trim(),
    住所: (row["住所"] ?? "").trim(),
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    電話番号: (row["電話番号"] ?? "").trim(),
    利用可能日時特記事項: (row["利用可能日時特記事項"] ?? "").trim(),
    バリアフリー情報: (row["バリアフリー情報"] ?? "").trim(),
    URL: (row["URL"] ?? "").trim(),
    備考: (row["備考"] ?? "").trim(),
  };
}

function makeWaterSupplyRecord(row: Record<string, string>) {
  return {
    名称: pickFirst(row, ["施設名", "名称"]),
    住所: pickFirst(row, ["所在地", "住所"]),
    緯度: row["緯度"] ?? "",
    経度: row["経度"] ?? "",
    種別: row["種別"] ?? "",
    確保水量: pickFirst(row, ["確保水量（立方メートル）", "確保水量"]),
    備考: row["備考"] ?? "",
  };
}

function anyTruthy(row: Record<string, string>, keys: string[]): "有" | "" {
  for (const k of keys) {
    const v = row[k];
    if (v && v !== "0" && v !== "false" && v.trim() !== "") return "有";
  }
  return "";
}

const PARSERS: Record<LayerKey, (row: Record<string, string>) => unknown> = {
  shelter: makeShelterRecord,
  assembly_point: makeAssemblyPointRecord,
  water_supply: makeWaterSupplyRecord,
  park: makeKotoFacilityRecord,
  library: makeKotoFacilityRecord,
  child_center: makeKotoFacilityRecord,
  nursery: makeKotoFacilityRecord,
};

const KOTO_FILTER: Record<LayerKey, string | null> = {
  shelter: "所在地住所",
  assembly_point: "所在地住所",
  water_supply: "所在地",
  park: null,
  library: null,
  child_center: null,
  nursery: null,
};

async function build(layer: LayerKey): Promise<void> {
  const src = SOURCES[layer];
  const text = await loadCsv(src);
  let rows = parseCsv(text).filter(
    (r) => isFiniteNumber(r["緯度"]) && isFiniteNumber(r["経度"]),
  );
  const kotoFilterKey = KOTO_FILTER[layer];
  if (kotoFilterKey != null) {
    rows = rows.filter((r) => isKotoRow(r, kotoFilterKey));
  }
  const records = rows.map(PARSERS[layer]);
  const payload = { result: { records } };
  await writeFile(src.out, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${records.length} records to ${src.out}`);
}

async function main(): Promise<void> {
  // tsx + esbuild compile this to CJS by default (package.json has no
  // "type": "module"), and CJS does not allow top-level await — F-17.
  // Wrapping the entry points in a `main()` keeps the .ts form runnable
  // via `npx tsx scripts/generate-pois.ts` like the sibling scripts.
  const layers: LayerKey[] = [
    "shelter",
    "assembly_point",
    "water_supply",
    "park",
    "library",
    "child_center",
    "nursery",
  ];
  for (const layer of layers) {
    await build(layer);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
