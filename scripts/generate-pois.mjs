#!/usr/bin/env node
// Build data/aed.json and data/toilet.json from official Koto-ku open data CSVs.
//
// Sources (CC-BY 4.0, 東京都・江東区):
// - https://www.city.koto.lg.jp/012107/documents/131083_aed.csv (UTF-8 BOM)
// - https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_toilet.csv (Shift_JIS)

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Inline copy of lib/csv.ts kept in sync via T-02 tests. We can't import the
// .ts file directly from a plain .mjs node script without an additional
// loader, so the canonical implementation lives in lib/csv.ts (with tests)
// and this minimal mirror supports the build script.
function parseCsvRow(line) {
  const out = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuote = false;
        continue;
      }
      cur += ch;
    } else {
      if (ch === '"') {
        inQuote = true;
        continue;
      }
      if (ch === ',') {
        out.push(cur);
        cur = '';
        continue;
      }
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIXTURE_DIR = join(ROOT, '__fixtures__', 'opendata');

const SOURCES = {
  aed: {
    url: 'https://www.city.koto.lg.jp/012107/documents/131083_aed.csv',
    cache: join(FIXTURE_DIR, 'koto-aed.csv'),
    out: join(ROOT, 'data', 'aed.json'),
    encoding: 'utf-8',
    parser: 'aed',
  },
  toilet: {
    url: 'https://www.city.koto.lg.jp/012107/documents/131083_kotocity_public_toilet.csv',
    cache: join(FIXTURE_DIR, 'koto-toilet.csv'),
    out: join(ROOT, 'data', 'toilet.json'),
    encoding: 'shift-jis',
    parser: 'toilet',
  },
};

async function loadCsv(src) {
  try {
    const cached = await readFile(src.cache, 'utf8');
    if (cached.length > 0) return cached;
  } catch {
    /* fall through */
  }
  console.log(`Fetching ${src.url}`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${src.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const decoder = new TextDecoder(src.encoding);
  const text = decoder.decode(buf).replace(/^﻿/, '');
  await mkdir(FIXTURE_DIR, { recursive: true });
  await writeFile(src.cache, text, 'utf8');
  return text;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvRow(line);
    const row = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? '';
    });
    return row;
  });
}

function isFiniteNumber(s) {
  if (!s) return false;
  const n = Number(s);
  return Number.isFinite(n);
}

function makeAedRecord(row) {
  // Schema (lib/opendata/schemas/aed.ts) uses Japanese keys.
  return {
    名称: row['名称'] ?? '',
    住所: row['所在地_連結表記'] || row['所在地'] || '',
    緯度: row['緯度'] ?? '',
    経度: row['経度'] ?? '',
    設置場所詳細: row['設置位置'] ?? '',
    利用可能時間: [row['開始時間'], row['終了時間']]
      .filter(Boolean)
      .join('-')
      .replace(/:00$/g, '')
      .replace(/:00-/g, '-'),
    電話番号: row['電話番号'] ?? '',
    備考: row['利用可能日時特記事項'] || row['備考'] || '',
  };
}

function truthy(v) {
  return v === '有' || v === '○' ? '有' : '';
}

function makeToiletRecord(row) {
  return {
    名称: row['名称'] ?? '',
    住所: row['住所'] ?? '',
    緯度: row['緯度'] ?? '',
    経度: row['経度'] ?? '',
    バリアフリー: truthy(row['車椅子使用者用トイレ有無']),
    二十四時間:
      row['利用開始時間'] === '0:00' && row['利用終了時間'] === '23:59'
        ? '有'
        : '',
    備考: row['備考'] ?? '',
  };
}

async function buildOne(key) {
  const src = SOURCES[key];
  const text = await loadCsv(src);
  const rows = parseCsv(text).filter((r) => isFiniteNumber(r['緯度']) && isFiniteNumber(r['経度']));
  const records = rows.map(src.parser === 'aed' ? makeAedRecord : makeToiletRecord);
  const payload = { result: { records } };
  await writeFile(src.out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${records.length} records to ${src.out}`);
}

await buildOne('aed');
await buildOne('toilet');
