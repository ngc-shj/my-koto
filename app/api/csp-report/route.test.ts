import { describe, expect, it, vi, beforeEach } from "vitest";
import { inMemoryKvStore } from "@/lib/proxy";

// The route mixes the rate-limit KV pipeline (incr/expire) with the CSP
// report list API (lpush/ltrim). Mock @vercel/kv with a single Map-backed
// double that implements both surfaces.
const rateLimitStore = inMemoryKvStore();
const lists = new Map<string, string[]>();

vi.mock("@vercel/kv", () => ({
  kv: {
    incr: vi.fn((key: string) => rateLimitStore.incr(key)),
    expire: vi.fn((key: string, ttl: number) =>
      rateLimitStore.expire(key, ttl),
    ),
    lpush: vi.fn((key: string, value: string) => {
      const list = lists.get(key) ?? [];
      list.unshift(value);
      lists.set(key, list);
      return Promise.resolve(list.length);
    }),
    ltrim: vi.fn((key: string, start: number, stop: number) => {
      const list = lists.get(key);
      if (!list) return Promise.resolve("OK");
      lists.set(key, list.slice(start, stop + 1));
      return Promise.resolve("OK");
    }),
  },
}));

vi.mock("@vercel/functions", () => ({
  ipAddress: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { POST, GET } from "./route";

function makeReq(body: unknown): Request {
  return new Request("https://koto-city.example.com/api/csp-report", {
    method: "POST",
    headers: { "Content-Type": "application/reports+json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/csp-report", () => {
  beforeEach(() => {
    lists.clear();
    vi.clearAllMocks();
  });

  it("returns 405 for GET", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });

  it("accepts a Reporting API v1 array envelope and persists one record", async () => {
    const body = [
      {
        type: "csp-violation",
        url: "https://example.com/page",
        user_agent: "Mozilla/5.0 ... Chrome/120 Safari/537",
        body: {
          documentURL: "https://example.com/page?x=1",
          blockedURL: "https://evil.example/script.js",
          violatedDirective: "script-src",
          effectiveDirective: "script-src",
          disposition: "enforce",
        },
      },
    ];
    const res = await POST(makeReq(body) as never);
    expect(res.status).toBe(204);
    const stored = lists.get("csp:reports:v1");
    expect(stored).toHaveLength(1);
    const parsed = JSON.parse(stored![0]) as {
      documentPath: string;
      blockedURL: string;
      violatedDirective: string;
      userAgentFamily: string;
    };
    // Query strings must be stripped at the storage boundary.
    expect(parsed.documentPath).toBe("https://example.com/page");
    expect(parsed.blockedURL).toBe("https://evil.example/script.js");
    expect(parsed.violatedDirective).toBe("script-src");
    expect(parsed.userAgentFamily).toBe("Chrome");
  });

  it("accepts the legacy report-uri envelope and persists one record", async () => {
    const body = {
      "csp-report": {
        "document-uri": "https://example.com/x",
        "blocked-uri": "https://evil.example/y",
        "violated-directive": "img-src",
      },
    };
    const res = await POST(makeReq(body) as never);
    expect(res.status).toBe(204);
    expect(lists.get("csp:reports:v1")).toHaveLength(1);
  });

  it("caps the per-request batch and silently drops the rest", async () => {
    const reports = Array.from({ length: 25 }, (_, i) => ({
      type: "csp-violation",
      body: {
        documentURL: `https://example.com/p${i}`,
        violatedDirective: "img-src",
      },
    }));
    const res = await POST(makeReq(reports) as never);
    expect(res.status).toBe(204);
    // Only the first 10 are accepted.
    expect(lists.get("csp:reports:v1")?.length).toBe(10);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("https://x.example/api/csp-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("sets Cache-Control: no-store on the response", async () => {
    const res = await POST(makeReq([]) as never);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
