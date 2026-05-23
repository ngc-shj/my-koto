import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import {
  validateAndPersist,
  parseWbgtCsv,
  ckanResolveCsvUrl,
  fetchCsvText,
  toAedRecord,
  toToiletRecord,
  toGomiRecord,
  toEventRecord,
  parseWeekdays,
} from "./fetch-opendata";

const TMP_DIR = join(tmpdir(), "koto-test-" + Date.now());

beforeEach(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

// T-06: clean the per-suite tmp directory so successive runs do not
// accumulate artefacts on dev machines or CI.
afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
});

const SimpleSchema = z.object({ value: z.number().min(0).max(100) });

describe("validateAndPersist", () => {
  it("writes file and returns ok:true for valid data", async () => {
    const outputPath = join(TMP_DIR, "valid.json");
    const notifier = vi.fn();

    const result = await validateAndPersist({ value: 42 }, SimpleSchema, outputPath, notifier);

    expect(result.ok).toBe(true);
    expect(existsSync(outputPath)).toBe(true);
    expect(JSON.parse(readFileSync(outputPath, "utf-8"))).toEqual({ value: 42 });
    expect(notifier).not.toHaveBeenCalled();
  });

  it("does NOT overwrite existing file on schema failure", async () => {
    const outputPath = join(TMP_DIR, "existing.json");

    // Write existing content
    const existingContent = JSON.stringify({ value: 50 }) + "\n";
    writeFileSync(outputPath, existingContent, "utf-8");

    const notifier = vi.fn();

    // Attempt to write invalid data (value > 100)
    const result = await validateAndPersist({ value: 999 }, SimpleSchema, outputPath, notifier);

    expect(result.ok).toBe(false);

    // Existing file must remain unchanged
    expect(readFileSync(outputPath, "utf-8")).toBe(existingContent);
  });

  it("calls Discord notifier on schema failure", async () => {
    const outputPath = join(TMP_DIR, "notify-test.json");
    const notifier = vi.fn().mockResolvedValue(undefined);

    await validateAndPersist({ value: -999 }, SimpleSchema, outputPath, notifier);

    expect(notifier).toHaveBeenCalledOnce();
    expect(notifier.mock.calls[0]?.[0]).toContain("Schema validation failed");
  });

  it("returns ok:false with reason on schema failure", async () => {
    const outputPath = join(TMP_DIR, "reason-test.json");
    const notifier = vi.fn();

    const result = await validateAndPersist({ value: "not-a-number" }, SimpleSchema, outputPath, notifier);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBeTruthy();
    }
  });

  it("does not create the file if schema fails and file does not exist", async () => {
    const outputPath = join(TMP_DIR, "never-created.json");
    const notifier = vi.fn();

    await validateAndPersist({ value: 999 }, SimpleSchema, outputPath, notifier);

    expect(existsSync(outputPath)).toBe(false);
  });
});

describe("ckanResolveCsvUrl", () => {
  function jsonRes(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("returns the first resource URL matching the pattern", async () => {
    const fakeFetch = vi.fn(
      async () =>
        jsonRes({
          result: {
            resources: [
              { url: "https://example.com/skip.json" },
              { url: "https://example.com/koto/131083_001_aed.csv" },
            ],
          },
        }),
    ) as unknown as typeof fetch;
    await expect(
      ckanResolveCsvUrl("t131083d0000000027", /aed.*\.csv$/i, fakeFetch),
    ).resolves.toBe("https://example.com/koto/131083_001_aed.csv");
  });

  it("threads UA + AbortSignal + redirect:'manual' onto the request", async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = vi.fn(
      async (_u: RequestInfo | URL, init?: RequestInit) => {
        captured = init;
        return jsonRes({
          result: { resources: [{ url: "https://example.com/x.csv" }] },
        });
      },
    ) as unknown as typeof fetch;
    await ckanResolveCsvUrl("d", /\.csv$/, fakeFetch);
    expect(captured?.redirect).toBe("manual");
    expect(captured?.signal).toBeInstanceOf(AbortSignal);
    const headers = captured?.headers as Record<string, string> | Headers;
    const ua =
      headers instanceof Headers
        ? headers.get("User-Agent")
        : (headers as Record<string, string> | undefined)?.["User-Agent"];
    expect(ua).toContain("koto-city");
  });

  it("throws on non-2xx", async () => {
    const fakeFetch = vi.fn(
      async () => new Response("err", { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      ckanResolveCsvUrl("d", /\.csv$/, fakeFetch),
    ).rejects.toThrow(/CKAN HTTP 500/);
  });

  it("throws when no resource matches", async () => {
    const fakeFetch = vi.fn(
      async () =>
        jsonRes({ result: { resources: [{ url: "https://example.com/x.json" }] } }),
    ) as unknown as typeof fetch;
    await expect(
      ckanResolveCsvUrl("d", /\.csv$/, fakeFetch),
    ).rejects.toThrow(/no resource matched/);
  });
});

describe("fetchCsvText", () => {
  it("strips a UTF-8 BOM from the head of the decoded body", async () => {
    const fakeFetch = vi.fn(async () => {
      const bom = Buffer.from([0xef, 0xbb, 0xbf]);
      return new Response(Buffer.concat([bom, Buffer.from("a,b\n1,2", "utf-8")]), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    await expect(fetchCsvText("https://x/y", "utf-8", fakeFetch)).resolves.toBe(
      "a,b\n1,2",
    );
  });

  it("decodes Shift_JIS bodies", async () => {
    // "あ" in Shift_JIS = 0x82 0xa0
    const fakeFetch = vi.fn(
      async () => new Response(Buffer.from([0x82, 0xa0]), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(fetchCsvText("https://x/y", "shift-jis", fakeFetch)).resolves.toBe(
      "あ",
    );
  });

  it("throws on non-2xx", async () => {
    const fakeFetch = vi.fn(
      async () => new Response("nope", { status: 404 }),
    ) as unknown as typeof fetch;
    await expect(fetchCsvText("https://x/y", "utf-8", fakeFetch)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("toAedRecord", () => {
  it("maps CKAN columns to the legacy schema shape", () => {
    expect(
      toAedRecord({
        名称: "有明西学園",
        所在地_連結表記: "東京都江東区有明1-7-13",
        緯度: "35.637038",
        経度: "139.784381",
        設置位置: "1階昇降口",
        電話番号: "(03)3527-6401",
        開始時間: "08:00:00",
        終了時間: "16:00:00",
        利用可能日時特記事項: "学校開庁日",
      }),
    ).toEqual({
      名称: "有明西学園",
      住所: "東京都江東区有明1-7-13",
      緯度: "35.637038",
      経度: "139.784381",
      設置場所詳細: "1階昇降口",
      利用可能時間: "08:00-16:00",
      電話番号: "(03)3527-6401",
      備考: "学校開庁日",
    });
  });

  it("leaves 利用可能時間 blank when start/end are missing", () => {
    expect(
      toAedRecord({ 名称: "X", 緯度: "1", 経度: "2" }).利用可能時間,
    ).toBe("");
  });
});

describe("toToiletRecord", () => {
  it("flags 24h, multi-purpose, and gender availability from CSV counts", () => {
    expect(
      toToiletRecord({
        名称: "豊洲公園トイレ",
        所在地_連結表記: "東京都江東区豊洲2-3-6",
        緯度: "35.65",
        経度: "139.79",
        男性トイレ総数: "2",
        女性トイレ総数: "0",
        バリアフリートイレ数: "1",
        車椅子使用者用トイレ有無: "有",
        利用開始時間: "0:00",
        利用終了時間: "23:59",
      }),
    ).toMatchObject({
      バリアフリー: "有",
      二十四時間: "有",
      男性用: "有",
      女性用: "",
      多目的: "有",
    });
  });
});

describe("parseWeekdays", () => {
  it("parses dot-separated kanji weekdays", () => {
    expect(parseWeekdays("月・木")).toEqual(["mon", "thu"]);
  });

  it("drops the （隔週） qualifier and keeps the day", () => {
    expect(parseWeekdays("（隔週）土")).toEqual(["sat"]);
  });

  it("returns [] for empty / undefined", () => {
    expect(parseWeekdays(undefined)).toEqual([]);
    expect(parseWeekdays("")).toEqual([]);
  });

  it("dedupes repeated days", () => {
    expect(parseWeekdays("月・月・水")).toEqual(["mon", "wed"]);
  });
});

describe("toGomiRecord", () => {
  it("maps a row from the Koto 廃棄物 CSV to the gomi schema shape", () => {
    expect(
      toGomiRecord({
        じゅうしょ: "あおみ",
        住所: "青海",
        地区番号: "6",
        燃やすごみ: "月・木",
        燃やさないごみ: "（隔週）土",
        プラスチック: "水",
        資源: "金",
      }),
    ).toEqual({
      地区ID: "6",
      地区名: "青海",
      燃やすごみ: ["mon", "thu"],
      燃やさないごみ: ["sat"],
      プラスチック: ["wed"],
      資源ごみ: ["fri"],
    });
  });
});

describe("toEventRecord", () => {
  it("renames イベント名→名称 and prefers URL over コンテンツURL", () => {
    expect(
      toEventRecord({
        イベント名: "江東区民まつり",
        開始日: "2026-05-17",
        終了日: "2026-05-18",
        場所名称: "木場公園",
        所在地_連結表記: "東京都江東区木場4",
        説明: "毎年恒例の区民まつり",
        URL: "https://www.city.koto.lg.jp/event",
        コンテンツURL: "http://example.com/insecure",
        主催者: "江東区",
      }),
    ).toMatchObject({
      名称: "江東区民まつり",
      場所: "木場公園",
      住所: "東京都江東区木場4",
      URL: "https://www.city.koto.lg.jp/event",
      主催: "江東区",
    });
  });

  it("falls back to コンテンツURL only when it is https", () => {
    expect(
      toEventRecord({
        イベント名: "X",
        開始日: "2026-01-01",
        コンテンツURL: "http://insecure.example.com",
      }).URL,
    ).toBeUndefined();
  });
});

describe("parseWbgtCsv", () => {
  it("returns an empty array when the CSV has only a header", () => {
    expect(parseWbgtCsv("datetime,value")).toEqual([]);
  });

  it("returns an empty array on empty input", () => {
    expect(parseWbgtCsv("")).toEqual([]);
  });

  it("skips rows with an empty datetime cell", () => {
    const csv = "datetime,value\n,28.4\n2026-05-04 12:00,30.1";
    expect(parseWbgtCsv(csv)).toEqual([
      { station: "東京", datetime: "2026-05-04 12:00", wbgt: 30.1 },
    ]);
  });

  it("skips rows whose value is not a finite number", () => {
    const csv = "datetime,value\n2026-05-04 12:00,NaN\n2026-05-04 13:00,32.0";
    expect(parseWbgtCsv(csv)).toEqual([
      { station: "東京", datetime: "2026-05-04 13:00", wbgt: 32.0 },
    ]);
  });

  it("ignores blank lines and supports CRLF", () => {
    const csv = "datetime,value\r\n2026-05-04 12:00,29.5\r\n\r\n2026-05-04 13:00,30.7";
    expect(parseWbgtCsv(csv)).toHaveLength(2);
  });

  it("respects custom station label when provided", () => {
    const csv = "datetime,value\n2026-05-04 12:00,28.0";
    expect(parseWbgtCsv(csv, "観測地点A")).toEqual([
      { station: "観測地点A", datetime: "2026-05-04 12:00", wbgt: 28.0 },
    ]);
  });
});
