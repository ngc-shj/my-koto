import { describe, expect, it } from "vitest";
import {
  appendReport,
  classifyUserAgent,
  CSP_REPORT_LIMITS,
  listReports,
  sanitise,
  type CspReportKv,
  type StoredReport,
} from "./reports";

function makeKv(): CspReportKv & {
  inspect(): Map<string, string[]>;
} {
  const lists = new Map<string, string[]>();
  return {
    async lpush(key, value) {
      const list = lists.get(key) ?? [];
      list.unshift(value);
      lists.set(key, list);
      return list.length;
    },
    async ltrim(key, start, stop) {
      const list = lists.get(key);
      if (!list) return "OK";
      const next = list.slice(start, stop + 1);
      lists.set(key, next);
      return "OK";
    },
    async lrange(key, start, stop) {
      const list = lists.get(key) ?? [];
      const end = stop === -1 ? list.length : stop + 1;
      return list.slice(start, end);
    },
    inspect: () => lists,
  };
}

describe("classifyUserAgent", () => {
  it.each([
    ["Mozilla/5.0 ... Chrome/120 Safari/537.36", "Chrome"],
    ["Mozilla/5.0 ... Edg/120", "Edge"],
    ["Mozilla/5.0 ... Firefox/120", "Firefox"],
    ["Mozilla/5.0 ... Safari/605", "Safari"],
    ["", undefined],
  ])("classifies %s → %s", (ua, expected) => {
    expect(classifyUserAgent(ua || undefined)).toBe(expected);
  });
});

describe("sanitise", () => {
  it("strips query strings from documentURL and blockedURL", () => {
    const out = sanitise(
      {
        type: "csp-violation",
        body: {
          documentURL: "https://example.com/page?token=secret",
          blockedURL: "https://evil.com/x?ref=user@example.com",
          violatedDirective: "script-src",
          disposition: "enforce",
        },
      },
      1_700_000_000_000,
    );
    expect(out?.documentPath).toBe("https://example.com/page");
    expect(out?.blockedURL).toBe("https://evil.com/x");
  });

  it("accepts both camelCase and dashed report keys", () => {
    const out = sanitise({
      body: {
        "document-uri": "https://x.example/p",
        "blocked-uri": "https://y.example/q",
        "violated-directive": "img-src",
      },
    });
    expect(out?.documentPath).toBe("https://x.example/p");
    expect(out?.blockedURL).toBe("https://y.example/q");
    expect(out?.violatedDirective).toBe("img-src");
  });

  it("classifies the user agent down to a browser family", () => {
    const out = sanitise({
      user_agent:
        "Mozilla/5.0 (Macintosh) AppleWebKit/605.1 Safari/605 Version/17",
      body: {
        documentURL: "https://x.example/p",
        violatedDirective: "img-src",
      },
    });
    expect(out?.userAgentFamily).toBe("Safari");
  });

  it("keeps a sanitised report's disposition only when it matches the spec", () => {
    const ok = sanitise({
      body: {
        documentURL: "https://x.example/",
        violatedDirective: "img-src",
        disposition: "enforce",
      },
    });
    expect(ok?.disposition).toBe("enforce");
    const bad = sanitise({
      body: {
        documentURL: "https://x.example/",
        violatedDirective: "img-src",
        disposition: "totally-arbitrary",
      },
    });
    expect(bad?.disposition).toBeUndefined();
  });

  it("returns null when neither documentURL nor directive is present", () => {
    const out = sanitise({ body: {} });
    expect(out).toBeNull();
  });

  it("truncates oversized samples", () => {
    const giant = "x".repeat(CSP_REPORT_LIMITS.maxSampleLength * 4);
    const out = sanitise({
      body: {
        documentURL: "https://x.example/",
        violatedDirective: "img-src",
        sample: giant,
      },
    });
    expect(out?.sample?.length).toBe(CSP_REPORT_LIMITS.maxSampleLength);
  });
});

describe("appendReport / listReports", () => {
  function makeReport(overrides: Partial<StoredReport> = {}): StoredReport {
    return {
      receivedAt: 1_700_000_000_000,
      documentPath: "https://x.example/p",
      blockedURL: "https://y.example/q",
      violatedDirective: "img-src",
      ...overrides,
    };
  }

  it("persists then reads back equivalent records", async () => {
    const kv = makeKv();
    await appendReport(kv, makeReport());
    const out = await listReports(kv);
    expect(out).toHaveLength(1);
    expect(out[0].documentPath).toBe("https://x.example/p");
  });

  it("keeps reports in newest-first order", async () => {
    const kv = makeKv();
    for (let i = 0; i < 3; i += 1) {
      await appendReport(
        kv,
        makeReport({ documentPath: `https://x.example/p${i}` }),
      );
    }
    const out = await listReports(kv);
    expect(out.map((r) => r.documentPath)).toEqual([
      "https://x.example/p2",
      "https://x.example/p1",
      "https://x.example/p0",
    ]);
  });

  it("caps retention at the configured limit", async () => {
    const kv = makeKv();
    for (let i = 0; i < CSP_REPORT_LIMITS.retentionLimit + 5; i += 1) {
      await appendReport(
        kv,
        makeReport({ documentPath: `https://x.example/p${i}` }),
      );
    }
    const out = await listReports(kv);
    expect(out).toHaveLength(CSP_REPORT_LIMITS.retentionLimit);
  });
});
