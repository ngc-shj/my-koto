#!/usr/bin/env node
// Build data/districts.json from the official Tokyo Open Data CSV.
//
// Source: https://www.opendata.metro.tokyo.lg.jp/koto/131083_201_kotocity_waste_recycle_collectionday.csv
// Encoding: Shift_JIS. License: CC-BY 4.0 (東京都・江東区).
//
// The CSV groups multiple 丁目 into single collection routes, so we keep
// each row as one district instead of expanding to per-chome entries.

import { writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_URL =
  'https://www.opendata.metro.tokyo.lg.jp/koto/131083_201_kotocity_waste_recycle_collectionday.csv';
const CACHE = join(ROOT, '__fixtures__', 'opendata', 'koto-gomi.csv');
const OUT = join(ROOT, 'data', 'districts.json');

const WEEKDAY_KANJI = {
  月: 'mon', 火: 'tue', 水: 'wed', 木: 'thu',
  金: 'fri', 土: 'sat', 日: 'sun',
};

// Mapping from city-area kanji to the hiragana slug used in the CSV's
// じゅうしょ column. Used to romanize the address for the id.
const READING_TO_SLUG = {
  あおみ: 'aomi',
  ありあけ: 'ariake',
  いしじま: 'ishijima',
  うみべ: 'umibe',
  うみのもり: 'uminomori',
  えいたい: 'eitai',
  えだがわ: 'edagawa',
  えっちゅうじま: 'etchujima',
  おうぎばし: 'ougibashi',
  おおじま: 'ojima',
  かめいど: 'kameido',
  きたすな: 'kitasuna',
  きば: 'kiba',
  きよすみ: 'kiyosumi',
  さが: 'saga',
  さるえ: 'sarue',
  しおはま: 'shiohama',
  しおみ: 'shiomi',
  しののめ: 'shinonome',
  しらかわ: 'shirakawa',
  しんおおはし: 'shin-ohashi',
  しんきば: 'shinkiba',
  しんすな: 'shinsuna',
  すみよし: 'sumiyoshi',
  せんごく: 'sengoku',
  せんだ: 'senda',
  たかばし: 'takabashi',
  たつみ: 'tatsumi',
  とうよう: 'toyo',
  ときわ: 'tokiwa',
  とみおか: 'tomioka',
  とよす: 'toyosu',
  ひがしすな: 'higashisuna',
  ひらの: 'hirano',
  ふかがわ: 'fukagawa',
  ふくずみ: 'fukuzumi',
  ふゆき: 'fuyuki',
  ふるいしば: 'furuishiba',
  ぼたん: 'botan',
  みなみすな: 'minamisuna',
  みよし: 'miyoshi',
  もりした: 'morishita',
  もうり: 'mouri',
  もんぜんなかちょう: 'monzen-nakacho',
  ゆめのしま: 'yumenoshima',
  わかす: 'wakasu',
};

// Joto area townships (亀戸／大島／砂町方面). Everything else is 深川.
const JOTO_TOWNS = new Set([
  'kameido', 'ojima', 'kitasuna', 'higashisuna', 'minamisuna',
  'shinsuna', 'shinkiba', 'yumenoshima', 'wakasu',
]);

async function loadCsv() {
  try {
    const cached = await readFile(CACHE, 'utf8');
    if (cached.length > 0) return cached;
  } catch {
    /* fall through to fetch */
  }
  console.log(`Fetching ${CSV_URL} ...`);
  const res = await fetch(CSV_URL);
  if (!res.ok) {
    throw new Error(`CSV fetch failed: HTTP ${res.status}`);
  }
  // Tokyo Open Data publishes Shift_JIS; the WHATWG decoder handles it.
  const buf = Buffer.from(await res.arrayBuffer());
  const decoder = new TextDecoder('shift-jis');
  const text = decoder.decode(buf);
  await writeFile(CACHE, text, 'utf8');
  return text;
}

function parseDays(cell) {
  // Cells look like '月', '月・木', '（隔週）土'.
  const trimmed = cell.replace(/\s+/g, '').replace(/^（隔週）/, '');
  const days = trimmed.split(/[・]/).map((d) => WEEKDAY_KANJI[d]).filter(Boolean);
  return { days, biweekly: cell.includes('（隔週）') };
}

function buildAddressSuffix(label, reading) {
  // Strip the reading-derived prefix when present so the remaining suffix
  // is unique per address (e.g. "亀戸1～3丁目" → "1〜3丁目").
  // Fallback: full label.
  const prefix = label.replace(/[\s　]+/g, '');
  const trimmed = prefix.replace(/^[一-龯々]+/, ''); // drop kanji prefix
  return trimmed || label;
}

function slugifySuffix(suffix) {
  if (!suffix) return '';
  // Pull out chome ranges like "1〜3丁目" or "1・5丁目".
  const m = suffix.match(/(\d+)[〜～\-・](\d+)/);
  if (m) return `${m[1]}-${m[2]}`;
  const single = suffix.match(/(\d+)/);
  if (single) return single[1];
  return '';
}

// Upstream CSV reading typos that the importer must correct before slug
// lookup. Without this, `新大橋` (officially しんおおはし) ships under the
// upstream's しんきば row and silently collides with 新木場's row, so any
// resident who picks 新木場 ends up with 新大橋's schedule (F-12).
const LABEL_READING_OVERRIDE = {
  新大橋: 'しんおおはし',
  毛利: 'もうり',
};

function rowToDistrict(row) {
  const [readingRaw, label, districtNumber, shigen, plastic, burnable, nonBurnable] = row;
  const areaCode = Number.parseInt(String(districtNumber).trim(), 10);
  const labelKey = label.replace(/\s+/g, '').replace(/^([一-龯々]+).*/, '$1');
  const overrideReading = LABEL_READING_OVERRIDE[labelKey];
  const reading = overrideReading ?? readingRaw.replace(/\s+/g, '');
  const baseSlug = READING_TO_SLUG[reading];
  if (!baseSlug) {
    throw new Error(`Unknown reading slug: ${reading} (label=${label})`);
  }
  const suffixSlug = slugifySuffix(label);
  const id = suffixSlug ? `${baseSlug}-${suffixSlug}` : baseSlug;
  const burnableDays = parseDays(burnable);
  const nonBurnableDays = parseDays(nonBurnable);
  const shigenDays = parseDays(shigen);
  const plasticDays = parseDays(plastic);
  // Build biweekly flags — only emit a key when the cell actually carries
  // 「（隔週）」. Schema treats absence as not-biweekly.
  const biweekly = {};
  if (burnableDays.biweekly) biweekly.burnable = true;
  if (nonBurnableDays.biweekly) biweekly.non_burnable = true;
  if (shigenDays.biweekly) {
    biweekly.resource_plastic = true;
    biweekly.pet_bottle = true;
    biweekly.bottles_cans = true;
  }
  if (plasticDays.biweekly) biweekly.container_plastic = true;
  const hasBiweekly = Object.keys(biweekly).length > 0;
  return {
    id,
    label,
    reading,
    area: JOTO_TOWNS.has(baseSlug) ? 'joto' : 'fukagawa',
    ...(Number.isInteger(areaCode) && areaCode >= 1 && areaCode <= 12
      ? { areaCode }
      : {}),
    addresses: [label],
    schedule: {
      burnable: burnableDays.days,
      non_burnable: nonBurnableDays.days,
      resource_plastic: shigenDays.days,
      container_plastic: plasticDays.days,
      pet_bottle: shigenDays.days,
      bottles_cans: shigenDays.days,
      bulky: [],
      ...(hasBiweekly ? { biweekly } : {}),
    },
  };
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const [, ...rows] = lines;
  return rows.map((line) => line.split(','));
}

const csv = await loadCsv();
const districts = parseCsv(csv).map(rowToDistrict);
// Sort by reading for stable ordering across rebuilds.
districts.sort((a, b) => (a.reading < b.reading ? -1 : a.reading > b.reading ? 1 : 0));

// Fail fast on duplicate ids so a future upstream typo cannot silently
// merge two collection routes (F-12 root cause). The build is broken
// rather than producing a `data/districts.json` with two records sharing
// the same `id` field.
const seenIds = new Map();
for (const d of districts) {
  if (seenIds.has(d.id)) {
    throw new Error(
      `Duplicate district id "${d.id}" — labels: ${seenIds.get(d.id)} and ${d.label}. ` +
        `Add a LABEL_READING_OVERRIDE entry or adjust slug derivation.`,
    );
  }
  seenIds.set(d.id, d.label);
}

await writeFile(OUT, JSON.stringify(districts, null, 2) + '\n', 'utf8');
console.log(`Wrote ${districts.length} districts to ${OUT}`);
