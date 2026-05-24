// SQL → legacy Zod-shaped response readers. Used by SSR pages, /api/ics
// routes, and the future Edge /api/datasets/* once they switch off KV.
//
// The functions reconstruct the same `{ result: { records: [...] } }`
// envelope the upstream returned, so existing consumers (lib/map/validate,
// lib/events/normalize, ...) need no change.

import type { Client, Row } from "@libsql/client";
import {
  AedResponseSchema,
  type AedResponse,
} from "@/lib/opendata/schemas/aed";
import {
  ToiletResponseSchema,
  type ToiletResponse,
} from "@/lib/opendata/schemas/toilet";
import {
  EventResponseSchema,
  type EventResponse,
} from "@/lib/opendata/schemas/events";
import {
  GomiResponseSchema,
  type GomiResponse,
  type Weekday,
} from "@/lib/opendata/schemas/gomi";
import {
  BusToeiDataSchema,
  type BusToeiData,
} from "@/lib/opendata/schemas/bus";

function s(row: Row, col: string): string {
  const v = row[col];
  return typeof v === "string" ? v : "";
}

function sOptional(row: Row, col: string): string | undefined {
  const v = row[col];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function num(row: Row, col: string): number {
  const v = row[col];
  return typeof v === "number" ? v : Number(v);
}

function jsonWeekdays(row: Row, col: string): Weekday[] {
  const v = row[col];
  if (typeof v !== "string" || v.length === 0) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as Weekday[]) : [];
  } catch {
    return [];
  }
}

export async function readAed(client: Client): Promise<AedResponse> {
  const res = await client.execute("SELECT * FROM aed");
  const records = res.rows.map((row) => ({
    名称: s(row, "name"),
    住所: s(row, "address"),
    緯度: String(num(row, "lat")),
    経度: String(num(row, "lng")),
    設置場所詳細: sOptional(row, "location_detail"),
    利用可能時間: sOptional(row, "hours"),
    電話番号: sOptional(row, "phone"),
    備考: sOptional(row, "note"),
  }));
  return AedResponseSchema.parse({ result: { records } });
}

export async function readToilet(client: Client): Promise<ToiletResponse> {
  const res = await client.execute("SELECT * FROM toilet");
  const records = res.rows.map((row) => ({
    名称: s(row, "name"),
    住所: s(row, "address"),
    緯度: String(num(row, "lat")),
    経度: String(num(row, "lng")),
    バリアフリー: sOptional(row, "barrier_free"),
    二十四時間: sOptional(row, "all_day"),
    男性用: sOptional(row, "male"),
    女性用: sOptional(row, "female"),
    多目的: sOptional(row, "multipurpose"),
    備考: sOptional(row, "note"),
  }));
  return ToiletResponseSchema.parse({ result: { records } });
}

// `upcomingFrom` narrows the result to events whose interval overlaps
// [today, today + windowDays] at the SQL layer. Dropping the in-memory
// filterUpcoming pass means SSR/ICS don't ship the whole multi-year row
// set through libsql just to throw most of it away in JS.
export async function readEvents(
  client: Client,
  options?: { upcomingFrom?: Date; windowDays?: number },
): Promise<EventResponse> {
  let sql = "SELECT * FROM events";
  const args: (string | number)[] = [];
  if (options?.upcomingFrom) {
    const today = formatLocalDate(options.upcomingFrom);
    const limit = formatLocalDate(
      addDays(options.upcomingFrom, options.windowDays ?? 90),
    );
    // start_date / end_date are stored as YYYY-MM-DD; lexical comparison
    // is correct date comparison for that format. COALESCE handles the
    // common case of single-day events with no end_date.
    sql += " WHERE COALESCE(end_date, start_date) >= ? AND start_date <= ?";
    args.push(today, limit);
  }
  sql += " ORDER BY start_date";
  const res = await client.execute({ sql, args });
  const records = res.rows.map((row) => ({
    名称: s(row, "name"),
    開始日: s(row, "start_date"),
    終了日: sOptional(row, "end_date"),
    場所: sOptional(row, "location"),
    住所: sOptional(row, "address"),
    説明: sOptional(row, "description"),
    URL: sOptional(row, "url"),
    主催: sOptional(row, "organizer"),
    備考: sOptional(row, "note"),
  }));
  return EventResponseSchema.parse({ result: { records } });
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

export async function readGomi(client: Client): Promise<GomiResponse> {
  const res = await client.execute("SELECT * FROM gomi");
  const records = res.rows.map((row) => ({
    地区ID: s(row, "district_id"),
    地区名: s(row, "district_name"),
    燃やすごみ: jsonWeekdays(row, "burnable_days"),
    燃やさないごみ: jsonWeekdays(row, "non_burnable_days"),
    プラスチック: jsonWeekdays(row, "plastic_days"),
    資源ごみ: jsonWeekdays(row, "resource_days"),
  }));
  return GomiResponseSchema.parse({ result: { records } });
}

// Bus is stored as a single JSON-encoded BLOB row keyed by agency.
// `agency` defaults to "toei" (the only carrier we currently sync); a
// second one can be added later without touching the schema.
export async function readBus(
  client: Client,
  agency = "toei",
): Promise<BusToeiData> {
  const res = await client.execute({
    sql: "SELECT data FROM bus WHERE agency = ? LIMIT 1",
    args: [agency],
  });
  const row = res.rows[0];
  if (!row) throw new Error(`bus snapshot not loaded for agency=${agency}`);
  const blob = row["data"];
  // libsql returns BLOB columns as ArrayBuffer (not Uint8Array). Accept
  // both so callers don't have to care which driver runtime is in play.
  let bytes: Uint8Array;
  if (blob instanceof Uint8Array) bytes = blob;
  else if (blob instanceof ArrayBuffer) bytes = new Uint8Array(blob);
  else throw new Error(`bus.data not a BLOB (got ${typeof blob})`);
  const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
  return BusToeiDataSchema.parse(json);
}

// Returns the freshness token stored by ensure-data for a given source
// id. Used by Edge routes to ask "is the cache still current?" without
// hitting upstream.
export async function readMetaVersion(
  client: Client,
  sourceId: string,
): Promise<string | undefined> {
  const res = await client.execute({
    sql: "SELECT version FROM _meta WHERE source_id = ? LIMIT 1",
    args: [sourceId],
  });
  const row = res.rows[0];
  if (!row) return undefined;
  const v = row["version"];
  return typeof v === "string" ? v : undefined;
}
