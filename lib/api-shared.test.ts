import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory @vercel/kv stub before route imports.
const memory = new Map<string, unknown>();
const ttl = new Map<string, number>();
vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (k: string) => memory.get(k) ?? null),
    set: vi.fn(async (k: string, v: unknown) => {
      memory.set(k, v);
    }),
    incr: vi.fn(async (k: string) => {
      const cur = (memory.get(k) as number) ?? 0;
      memory.set(k, cur + 1);
      return cur + 1;
    }),
    expire: vi.fn(async (k: string, sec: number) => {
      ttl.set(k, sec);
    }),
  },
}));

import {
  buildKv,
  checkRateLimit,
  rateLimitResponse,
  jsonResponseHeaders,
  getAllowedOrigin,
} from "./api-shared";

beforeEach(() => {
  memory.clear();
  ttl.clear();
  vi.restoreAllMocks();
});

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/x", { headers });
}

describe("checkRateLimit", () => {
  it("allows the first request and returns ok:true", async () => {
    const result = await checkRateLimit(makeReq(), {
      bucket: "test1",
      limit: 5,
      windowSec: 60,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects after the limit and returns retryAfter", async () => {
    for (let i = 0; i < 3; i += 1) {
      const ok = await checkRateLimit(makeReq(), {
        bucket: "test2",
        limit: 3,
        windowSec: 60,
      });
      expect(ok.ok).toBe(true);
    }
    const denied = await checkRateLimit(makeReq(), {
      bucket: "test2",
      limit: 3,
      windowSec: 60,
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.retryAfter).toBeGreaterThan(0);
    }
  });

  it("isolates buckets — exhausting one does not throttle another", async () => {
    for (let i = 0; i < 2; i += 1) {
      await checkRateLimit(makeReq(), { bucket: "iso-a", limit: 2, windowSec: 60 });
    }
    const aDenied = await checkRateLimit(makeReq(), {
      bucket: "iso-a",
      limit: 2,
      windowSec: 60,
    });
    expect(aDenied.ok).toBe(false);
    const bAllowed = await checkRateLimit(makeReq(), {
      bucket: "iso-b",
      limit: 2,
      windowSec: 60,
    });
    expect(bAllowed.ok).toBe(true);
  });
});

describe("rateLimitResponse", () => {
  it("returns null when under the limit", async () => {
    const headers = jsonResponseHeaders("https://koto.example");
    const res = await rateLimitResponse(
      makeReq(),
      { bucket: "rlr1", limit: 1, windowSec: 60 },
      headers,
    );
    expect(res).toBeNull();
  });

  it("returns 429 with Retry-After when the limit is exceeded", async () => {
    const headers = jsonResponseHeaders("https://koto.example");
    const cfg = { bucket: "rlr2", limit: 1, windowSec: 60 };
    // First call consumes the budget.
    const first = await rateLimitResponse(makeReq(), cfg, headers);
    expect(first).toBeNull();
    const second = await rateLimitResponse(makeReq(), cfg, headers);
    expect(second).not.toBeNull();
    expect(second!.status).toBe(429);
    expect(second!.headers.get("Retry-After")).not.toBeNull();
  });
});

describe("jsonResponseHeaders", () => {
  it("sets the standard cache + cors envelope", () => {
    const h = jsonResponseHeaders("https://koto.example");
    expect(h.get("Content-Type")).toBe("application/json");
    expect(h.get("Cache-Control")).toContain("s-maxage=3600");
    expect(h.get("Cache-Control")).toContain("stale-if-error=86400");
    expect(h.get("Vary")).toBe("Accept-Encoding");
    expect(h.get("Access-Control-Allow-Origin")).toBe("https://koto.example");
  });
});

describe("getAllowedOrigin", () => {
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  it("returns the env value when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.app";
    try {
      expect(getAllowedOrigin()).toBe("https://example.app");
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });
  it("falls back to localhost when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      expect(getAllowedOrigin()).toBe("http://localhost:3000");
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  });
});

describe("buildKv", () => {
  it("returns a KVStore that round-trips set/get", async () => {
    const kv = buildKv();
    await kv.set("hello", { value: 42 });
    const got = await kv.get<{ value: number }>("hello");
    expect(got).toEqual({ value: 42 });
  });
});
