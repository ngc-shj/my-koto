// Client for 環境省 熱中症予防情報サイト WBGT forecast.
//
// CSV shape (`yohou_<station>.csv`):
//   ,,YYYYMMDDHH,YYYYMMDDHH,...   <- header row, first 2 cols blank
//   <station>,<fetched at>,N,N,N,...   <- one data row, values in 0.1°C units
//
// Single forecast file lists the station's WBGT for ~18 future hours
// (3-hourly cadence, ~2 days ahead). Values are integers in tenths of a
// degree Celsius (140 = 14.0 °C); we divide by 10 in the parser.
//
// We pin the station code in the URL — there is no user-controlled path —
// so no path-injection attack surface exists for this proxy.
import { UPSTREAM_HOSTS } from "@/config/proxy-allowlist";
import { parseCsvRow } from "@/lib/csv";
import {
  WbgtDataSchema,
  type WbgtData,
  type WbgtReading,
} from "@/lib/opendata/schemas/wbgt";

export const WBGT_BASE = "https://www.wbgt.env.go.jp/prev15WG/dl";

export const WBGT_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  UPSTREAM_HOSTS.wbgt,
]);

// Build the forecast URL. Station codes come from the 環境省 master list;
// the value is constrained to digits at the call site.
export function buildWbgtUrl(stationCode: string, base = WBGT_BASE): URL {
  if (!/^\d+$/.test(stationCode)) {
    throw new Error("station code must be digits only");
  }
  return new URL(`${base}/yohou_${stationCode}.csv`);
}

export function validateUpstreamHost(
  url: URL,
  allowlist: ReadonlySet<string>,
): boolean {
  return allowlist.has(url.hostname);
}

// Convert "YYYYMMDDHH" → "YYYY-MM-DDTHH:00:00+09:00". The 環境省 publishes
// times in JST without an explicit offset, so we anchor to +09:00 here.
function isoFromYmdh(ymdh: string): string | null {
  if (!/^\d{10}$/.test(ymdh)) return null;
  const y = ymdh.slice(0, 4);
  const m = ymdh.slice(4, 6);
  const d = ymdh.slice(6, 8);
  // The CSV emits hour=24 to mean "midnight of the next day". Normalise
  // by shifting the date forward and using hour=00 so downstream consumers
  // can pass the string directly to new Date().
  const rawHour = parseInt(ymdh.slice(8, 10), 10);
  if (rawHour === 24) {
    const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    dt.setUTCDate(dt.getUTCDate() + 1);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}T00:00:00+09:00`;
  }
  const hh = String(rawHour).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:00:00+09:00`;
}

// Parse the upstream CSV into the canonical WbgtData envelope. Throws when
// the structure is unexpected so the route handler can reply 502 rather
// than ship a malformed payload.
//
// `parseCsv` (header→field-name view) is unsuitable here because the WBGT
// header row is mostly blank columns plus YYYYMMDDHH literals — there are
// no meaningful field names to key by. We parse two physical rows with the
// quote-aware tokenizer and walk by column index instead.
export function parseWbgtCsv(text: string): WbgtData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) {
    throw new Error("WBGT CSV missing header or data row");
  }
  const headerCells = parseCsvRow(lines[0]);
  const dataCells = parseCsvRow(lines[1]);
  if (dataCells.length !== headerCells.length) {
    throw new Error(
      `WBGT CSV column mismatch: header=${headerCells.length} data=${dataCells.length}`,
    );
  }
  const station = (dataCells[0] ?? "").trim();
  const fetchedAt = (dataCells[1] ?? "").trim();
  const readings: WbgtReading[] = [];
  for (let i = 2; i < headerCells.length; i += 1) {
    const ymdh = headerCells[i].trim();
    const valueCell = (dataCells[i] ?? "").trim();
    if (ymdh === "" || valueCell === "") continue;
    const isoTime = isoFromYmdh(ymdh);
    if (isoTime === null) continue;
    const tenth = parseInt(valueCell, 10);
    if (!Number.isFinite(tenth)) continue;
    const wbgt = tenth / 10;
    if (wbgt < 0 || wbgt > 50) continue;
    readings.push({ station, datetime: isoTime, wbgt });
  }
  return WbgtDataSchema.parse({ fetchedAt, readings });
}
