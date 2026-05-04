import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { writeFileSync, existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { validateAndPersist, fetchJson, parseWbgtCsv } from "./fetch-opendata";

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

describe("fetchJson", () => {
  function makeRes(body: unknown, init: ResponseInit & { contentType?: string }): Response {
    return new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status: init.status ?? 200,
      headers: { "Content-Type": init.contentType ?? "application/json" },
    });
  }

  it("calls fetch with redirect: 'manual' and an AbortSignal", async () => {
    let captured: RequestInit | undefined;
    const fakeFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return makeRes({ ok: true }, { contentType: "application/json" });
    }) as unknown as typeof fetch;

    await fetchJson("https://example.com/api", fakeFetch);
    expect(captured?.redirect).toBe("manual");
    expect(captured?.signal).toBeInstanceOf(AbortSignal);
    const headers = captured?.headers as Record<string, string> | Headers;
    const ua =
      headers instanceof Headers
        ? headers.get("User-Agent")
        : (headers as Record<string, string> | undefined)?.["User-Agent"];
    expect(ua).toContain("koto-city");
  });

  it("throws on non-2xx status", async () => {
    const fakeFetch = vi.fn(
      async () => makeRes("err", { status: 502, contentType: "text/plain" }),
    ) as unknown as typeof fetch;
    await expect(fetchJson("https://example.com/api", fakeFetch)).rejects.toThrow(
      /HTTP 502/,
    );
  });

  it("rejects unexpected Content-Type", async () => {
    const fakeFetch = vi.fn(
      async () => makeRes("<html>", { status: 200, contentType: "text/html" }),
    ) as unknown as typeof fetch;
    await expect(fetchJson("https://example.com/api", fakeFetch)).rejects.toThrow(
      /Unexpected Content-Type/,
    );
  });

  it("accepts text/json as well as application/json", async () => {
    const fakeFetch = vi.fn(
      async () => makeRes({ ok: true }, { status: 200, contentType: "text/json" }),
    ) as unknown as typeof fetch;
    await expect(fetchJson("https://example.com/api", fakeFetch)).resolves.toEqual({
      ok: true,
    });
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
