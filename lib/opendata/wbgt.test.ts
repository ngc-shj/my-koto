import { describe, expect, it } from "vitest";
import {
  buildWbgtUrl,
  parseWbgtCsv,
  validateUpstreamHost,
  WBGT_ALLOWED_HOSTS,
} from "./wbgt";

describe("buildWbgtUrl", () => {
  it("targets the forecast endpoint at the canonical host", () => {
    const url = buildWbgtUrl("44132");
    expect(url.hostname).toBe("www.wbgt.env.go.jp");
    expect(url.pathname).toBe("/prev15WG/dl/yohou_44132.csv");
  });

  it("rejects non-numeric station codes (path injection guard)", () => {
    expect(() => buildWbgtUrl("../../etc/passwd")).toThrow();
    expect(() => buildWbgtUrl("44132;rm")).toThrow();
  });
});

describe("validateUpstreamHost", () => {
  it("accepts the WBGT host", () => {
    const url = new URL("https://www.wbgt.env.go.jp/x");
    expect(validateUpstreamHost(url, WBGT_ALLOWED_HOSTS)).toBe(true);
  });

  it("rejects a host outside the allowlist", () => {
    const url = new URL("https://evil.example/x");
    expect(validateUpstreamHost(url, WBGT_ALLOWED_HOSTS)).toBe(false);
  });
});

describe("parseWbgtCsv", () => {
  // Two rows mirroring the live upstream shape: header has 2 leading blank
  // columns then YYYYMMDDHH datetimes; data row has station, fetchedAt, then
  // integer values in 0.1°C units.
  const fixture = `,,2026050421,2026050424,2026050503
44132,2026/05/04 20:25, 140, 120, 100`;

  it("parses fetchedAt and produces one reading per forecast hour", () => {
    const data = parseWbgtCsv(fixture);
    expect(data.fetchedAt).toBe("2026/05/04 20:25");
    expect(data.readings).toHaveLength(3);
  });

  it("converts tenths to degrees Celsius", () => {
    const data = parseWbgtCsv(fixture);
    expect(data.readings[0].wbgt).toBeCloseTo(14.0, 5);
    expect(data.readings[1].wbgt).toBeCloseTo(12.0, 5);
    expect(data.readings[2].wbgt).toBeCloseTo(10.0, 5);
  });

  it("emits ISO 8601 datetimes anchored to JST", () => {
    const data = parseWbgtCsv(fixture);
    expect(data.readings[0].datetime).toBe("2026-05-04T21:00:00+09:00");
    expect(data.readings[2].datetime).toBe("2026-05-05T03:00:00+09:00");
  });

  it("normalises hour=24 to 00 of the following day", () => {
    const text = `,,2026050324
44132,2026/05/03 21:00, 150`;
    const data = parseWbgtCsv(text);
    expect(data.readings[0].datetime).toBe("2026-05-04T00:00:00+09:00");
  });

  it("attaches the station code from the data row to each reading", () => {
    const data = parseWbgtCsv(fixture);
    expect(data.readings.every((r) => r.station === "44132")).toBe(true);
  });

  it("drops cells whose value is empty or non-numeric", () => {
    const text = `,,2026050421,2026050424,2026050503
44132,2026/05/04 20:25, , -, 100`;
    const data = parseWbgtCsv(text);
    expect(data.readings.map((r) => r.wbgt)).toEqual([10.0]);
  });

  it("throws when header and data row column counts disagree", () => {
    const bad = `,,2026050421,2026050424
44132,2026/05/04 20:25, 140`;
    expect(() => parseWbgtCsv(bad)).toThrow();
  });

  it("throws when the input is empty or single-line", () => {
    expect(() => parseWbgtCsv("")).toThrow();
    expect(() => parseWbgtCsv(",,2026050421")).toThrow();
  });
});
