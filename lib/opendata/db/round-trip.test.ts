// @vitest-environment node
// libsql returns BLOB columns as Node's native ArrayBuffer; the default
// jsdom environment shadows that constructor with its own, so the
// `value instanceof ArrayBuffer` check in readBus would fail across the
// realm boundary. The DB tests need no DOM anyway.

import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { ensureSchema } from "./client";
import {
  readAed,
  readBus,
  readEvents,
  readGomi,
  readMetaVersion,
  readToilet,
} from "./readers";
import {
  writeAed,
  writeBus,
  writeEvents,
  writeGomi,
  writeToilet,
} from "./writers";
import { AedResponseSchema } from "@/lib/opendata/schemas/aed";
import { ToiletResponseSchema } from "@/lib/opendata/schemas/toilet";
import { EventResponseSchema } from "@/lib/opendata/schemas/events";
import { GomiResponseSchema } from "@/lib/opendata/schemas/gomi";
import { BusToeiDataSchema, type BusToeiData } from "@/lib/opendata/schemas/bus";

// The point of these tests isn't to re-verify SQL — it's to catch schema
// drift between writers, readers, and the CREATE TABLE statements. If a
// column is renamed in schema.ts but a writer/reader still references
// the old name, the round-trip below fails immediately instead of
// surviving until a Cron run in production.

let db: Client;

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await ensureSchema(db);
});

describe("ensureSchema", () => {
  it("is idempotent (running twice does not error)", async () => {
    await expect(ensureSchema(db)).resolves.not.toThrow();
  });
});

describe("aed writer/reader round-trip", () => {
  const fixture = AedResponseSchema.parse({
    result: {
      records: [
        {
          名称: "亀戸文化センター",
          住所: "東京都江東区亀戸2-19-1",
          緯度: "35.696",
          経度: "139.834",
          設置場所詳細: "1階ロビー",
          利用可能時間: "9:00-21:00",
          電話番号: "03-5626-2393",
          備考: "",
        },
      ],
    },
  });

  it("preserves all columns end-to-end", async () => {
    await writeAed(db, fixture, { sourceId: "aed", version: "v1" });
    const read = await readAed(db);
    expect(read.result.records).toHaveLength(1);
    const r = read.result.records[0]!;
    expect(r["名称"]).toBe("亀戸文化センター");
    expect(r["住所"]).toBe("東京都江東区亀戸2-19-1");
    expect(r["緯度"]).toBe("35.696");
    expect(r["経度"]).toBe("139.834");
    expect(r["設置場所詳細"]).toBe("1階ロビー");
    expect(r["利用可能時間"]).toBe("9:00-21:00");
    expect(r["電話番号"]).toBe("03-5626-2393");
  });

  it("a second write replaces the previous rows (no accumulation)", async () => {
    await writeAed(db, fixture, { sourceId: "aed", version: "v1" });
    const replacement = AedResponseSchema.parse({
      result: {
        records: [
          {
            名称: "別の施設",
            住所: "東京都江東区xxx",
            緯度: "35.7",
            経度: "139.8",
          },
        ],
      },
    });
    await writeAed(db, replacement, { sourceId: "aed", version: "v2" });
    const read = await readAed(db);
    expect(read.result.records).toHaveLength(1);
    expect(read.result.records[0]!["名称"]).toBe("別の施設");
  });
});

describe("toilet writer/reader round-trip", () => {
  it("preserves all columns end-to-end", async () => {
    const fixture = ToiletResponseSchema.parse({
      result: {
        records: [
          {
            名称: "亀戸公園トイレ",
            住所: "東京都江東区亀戸6丁目",
            緯度: "35.698",
            経度: "139.838",
            バリアフリー: "有",
            二十四時間: "○",
            男性用: "有",
            女性用: "有",
            多目的: "有",
            備考: "",
          },
        ],
      },
    });
    await writeToilet(db, fixture, { sourceId: "toilet", version: "v1" });
    const read = await readToilet(db);
    const r = read.result.records[0]!;
    expect(r["名称"]).toBe("亀戸公園トイレ");
    expect(r["バリアフリー"]).toBe("有");
    expect(r["二十四時間"]).toBe("○");
    expect(r["男性用"]).toBe("有");
    expect(r["女性用"]).toBe("有");
    expect(r["多目的"]).toBe("有");
  });
});

describe("events writer/reader round-trip", () => {
  const fixture = EventResponseSchema.parse({
    result: {
      records: [
        {
          名称: "過去イベント",
          開始日: "2024-01-01",
          終了日: "2024-01-02",
        },
        {
          名称: "今日からのイベント",
          開始日: "2026-05-24",
          終了日: "2026-05-30",
        },
        {
          名称: "ウィンドウ内",
          開始日: "2026-07-01",
        },
        {
          名称: "ウィンドウ外",
          開始日: "2027-01-01",
        },
      ],
    },
  });

  it("preserves all columns and ordering by start_date", async () => {
    await writeEvents(db, fixture, { sourceId: "events", version: "v1" });
    const read = await readEvents(db);
    expect(read.result.records.map((r) => r["名称"])).toEqual([
      "過去イベント",
      "今日からのイベント",
      "ウィンドウ内",
      "ウィンドウ外",
    ]);
  });

  it("upcomingFrom narrows to events overlapping [from, from+windowDays]", async () => {
    await writeEvents(db, fixture, { sourceId: "events", version: "v1" });
    const now = new Date(2026, 4, 24);
    const read = await readEvents(db, { upcomingFrom: now, windowDays: 90 });
    expect(read.result.records.map((r) => r["名称"])).toEqual([
      "今日からのイベント",
      "ウィンドウ内",
    ]);
  });

  it("upcomingFrom keeps an event whose end_date is exactly today", async () => {
    await writeEvents(
      db,
      EventResponseSchema.parse({
        result: {
          records: [
            { 名称: "終わる日", 開始日: "2026-05-01", 終了日: "2026-05-24" },
          ],
        },
      }),
      { sourceId: "events", version: "v1" },
    );
    const read = await readEvents(db, {
      upcomingFrom: new Date(2026, 4, 24),
    });
    expect(read.result.records).toHaveLength(1);
  });

  it("custom windowDays narrows the future side", async () => {
    await writeEvents(db, fixture, { sourceId: "events", version: "v1" });
    const read = await readEvents(db, {
      upcomingFrom: new Date(2026, 4, 24),
      windowDays: 30,
    });
    // Only "今日からのイベント" (2026-05-30) fits in a 30-day window.
    expect(read.result.records.map((r) => r["名称"])).toEqual([
      "今日からのイベント",
    ]);
  });
});

describe("gomi writer/reader round-trip", () => {
  it("preserves weekday arrays through JSON encoding", async () => {
    const fixture = GomiResponseSchema.parse({
      result: {
        records: [
          {
            地区ID: "kameido-1",
            地区名: "亀戸1丁目",
            燃やすごみ: ["mon", "thu"],
            燃やさないごみ: ["wed"],
            プラスチック: ["tue"],
            資源ごみ: ["sat"],
          },
        ],
      },
    });
    await writeGomi(db, fixture, { sourceId: "gomi", version: "v1" });
    const read = await readGomi(db);
    const r = read.result.records[0]!;
    expect(r["燃やすごみ"]).toEqual(["mon", "thu"]);
    expect(r["燃やさないごみ"]).toEqual(["wed"]);
    expect(r["プラスチック"]).toEqual(["tue"]);
    expect(r["資源ごみ"]).toEqual(["sat"]);
  });
});

describe("bus BLOB round-trip", () => {
  const sample: BusToeiData = {
    fetchedAt: "2026-05-24T00:00:00.000Z",
    feedVersion: "20260524",
    source: "https://api-public.odpt.org/api/v4/files/Toei/data/ToeiBus-GTFS.zip",
    license: {
      name: "CC-BY 4.0",
      url: "https://creativecommons.org/licenses/by/4.0/deed.ja",
    },
    stops: {
      A1: { stopId: "A1", name: "豊洲駅前", lat: 35.654, lng: 139.795 },
    },
    routes: [
      {
        routeId: "R1",
        shortName: "海01",
        longName: "豊洲↔︎門前仲町",
        agencyId: "toei",
        directions: [
          {
            directionId: "0",
            headsign: "門前仲町",
            stopSequence: ["A1"],
            schedule: { weekday: [], saturday: [], sunday: [] },
          },
        ],
      },
    ],
  };

  it("decodes the BLOB back into the same BusToeiData shape", async () => {
    await writeBus(db, "toei", sample, { sourceId: "bus", version: "20260524" });
    const read = await readBus(db, "toei");
    // Re-validate against the schema so any silent type slip on the BLOB
    // path surfaces here too.
    const reparsed = BusToeiDataSchema.parse(read);
    expect(reparsed).toStrictEqual(sample);
  });

  it("throws a clear error when the requested agency is missing", async () => {
    await expect(readBus(db, "unknown")).rejects.toThrow(/bus snapshot not loaded/);
  });
});

describe("_meta upsert", () => {
  it("upsertMeta via a writer creates a row that readMetaVersion can find", async () => {
    const fixture = AedResponseSchema.parse({
      result: { records: [] },
    });
    await writeAed(db, fixture, { sourceId: "aed", version: "abc" });
    const v = await readMetaVersion(db, "aed");
    expect(v).toBe("abc");
  });

  it("a second write with a different version overwrites the previous row", async () => {
    const fixture = AedResponseSchema.parse({
      result: { records: [] },
    });
    await writeAed(db, fixture, { sourceId: "aed", version: "first" });
    await writeAed(db, fixture, { sourceId: "aed", version: "second" });
    const v = await readMetaVersion(db, "aed");
    expect(v).toBe("second");
  });

  it("returns undefined when the source has never been written", async () => {
    const v = await readMetaVersion(db, "nothing-here");
    expect(v).toBeUndefined();
  });
});
