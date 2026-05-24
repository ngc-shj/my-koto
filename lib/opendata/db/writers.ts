// Per-dataset bulk writers. Used by `scripts/ensure-data.mjs` after a
// successful upstream fetch. Each writer replaces the table contents in
// a single transaction so partial writes never leak.

import type { Client, InStatement } from "@libsql/client";
import type { AedResponse } from "@/lib/opendata/schemas/aed";
import type { ToiletResponse } from "@/lib/opendata/schemas/toilet";
import type { EventResponse } from "@/lib/opendata/schemas/events";
import type { GomiResponse } from "@/lib/opendata/schemas/gomi";

export type WriteMeta = {
  readonly sourceId: string;
  readonly version: string;
};

async function replaceTable(
  client: Client,
  table: string,
  inserts: InStatement[],
): Promise<void> {
  await client.batch([{ sql: `DELETE FROM ${table}` }, ...inserts], "write");
}

async function upsertMeta(client: Client, meta: WriteMeta): Promise<void> {
  await client.execute({
    sql: `INSERT INTO _meta (source_id, version, fetched_at)
          VALUES (?, ?, ?)
          ON CONFLICT(source_id) DO UPDATE SET
            version = excluded.version,
            fetched_at = excluded.fetched_at`,
    args: [meta.sourceId, meta.version, new Date().toISOString()],
  });
}

export async function writeAed(
  client: Client,
  response: AedResponse,
  meta: WriteMeta,
): Promise<void> {
  const inserts = response.result.records.map((r) => ({
    sql: `INSERT INTO aed
          (name, address, lat, lng, location_detail, hours, phone, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      r["名称"],
      r["住所"],
      Number(r["緯度"]),
      Number(r["経度"]),
      r["設置場所詳細"] ?? null,
      r["利用可能時間"] ?? null,
      r["電話番号"] ?? null,
      r["備考"] ?? null,
    ],
  }));
  await replaceTable(client, "aed", inserts);
  await upsertMeta(client, meta);
}

export async function writeToilet(
  client: Client,
  response: ToiletResponse,
  meta: WriteMeta,
): Promise<void> {
  const inserts = response.result.records.map((r) => ({
    sql: `INSERT INTO toilet
          (name, address, lat, lng, barrier_free, all_day, male, female, multipurpose, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      r["名称"],
      r["住所"],
      Number(r["緯度"]),
      Number(r["経度"]),
      r["バリアフリー"] ?? null,
      r["二十四時間"] ?? null,
      r["男性用"] ?? null,
      r["女性用"] ?? null,
      r["多目的"] ?? null,
      r["備考"] ?? null,
    ],
  }));
  await replaceTable(client, "toilet", inserts);
  await upsertMeta(client, meta);
}

export async function writeEvents(
  client: Client,
  response: EventResponse,
  meta: WriteMeta,
): Promise<void> {
  const inserts = response.result.records.map((r) => ({
    sql: `INSERT INTO events
          (name, start_date, end_date, location, address, description, url, organizer, note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      r["名称"],
      r["開始日"],
      r["終了日"] ?? null,
      r["場所"] ?? null,
      r["住所"] ?? null,
      r["説明"] ?? null,
      r["URL"] ?? null,
      r["主催"] ?? null,
      r["備考"] ?? null,
    ],
  }));
  await replaceTable(client, "events", inserts);
  await upsertMeta(client, meta);
}

export async function writeGomi(
  client: Client,
  response: GomiResponse,
  meta: WriteMeta,
): Promise<void> {
  const inserts = response.result.records.map((r) => ({
    sql: `INSERT INTO gomi
          (district_id, district_name, burnable_days, non_burnable_days, plastic_days, resource_days)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      r["地区ID"],
      r["地区名"],
      JSON.stringify(r["燃やすごみ"] ?? []),
      JSON.stringify(r["燃やさないごみ"] ?? []),
      JSON.stringify(r["プラスチック"] ?? []),
      JSON.stringify(r["資源ごみ"] ?? []),
    ],
  }));
  await replaceTable(client, "gomi", inserts);
  await upsertMeta(client, meta);
}
