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
import { WEATHER_CACHE, POIS_CACHE } from "@/config/cache";

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

  it("rateLimitResponse 429 emits Cache-Control: no-store and drops s-maxage", async () => {
    // baseHeaders carries a positive cache directive from jsonResponseHeaders.
    const baseHeaders = jsonResponseHeaders("https://koto.example", {
      maxAge: WEATHER_CACHE.BROWSER_MAX_AGE,
      sMaxAge: WEATHER_CACHE.SHARED_MAX_AGE,
      staleWhileRevalidate: WEATHER_CACHE.STALE_WHILE_REVALIDATE,
      staleIfError: WEATHER_CACHE.STALE_IF_ERROR,
    });
    const cfg = { bucket: "rlr3", limit: 1, windowSec: 60 };
    // First call passes.
    await rateLimitResponse(makeReq(), cfg, baseHeaders);
    // Second call hits the 429 path.
    const res = await rateLimitResponse(makeReq(), cfg, baseHeaders);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    const cc = res!.headers.get("Cache-Control");
    expect(cc).toBe("no-store");
    expect(cc).not.toContain("s-maxage");
    expect(cc).not.toContain(`max-age=${WEATHER_CACHE.BROWSER_MAX_AGE}`);
    expect(res!.headers.get("Retry-After")).not.toBeNull();
  });
});

describe("jsonResponseHeaders", () => {
  it("sets the standard cache + cors envelope (no cache arg)", () => {
    const h = jsonResponseHeaders("https://koto.example");
    expect(h.get("Content-Type")).toBe("application/json");
    const cc = h.get("Cache-Control")!;
    // Default: public, s-maxage=3600, stale-if-error=86400 (no max-age/SWR).
    expect(cc).toContain("public");
    expect(cc).toContain(`s-maxage=${POIS_CACHE.SHARED_MAX_AGE}`);
    expect(cc).toContain(`stale-if-error=${POIS_CACHE.STALE_IF_ERROR}`);
    // No browser max-age in default — CDN-only caching.
    expect(cc).not.toContain("max-age=");
    expect(h.get("Vary")).toBe("Accept-Encoding");
    expect(h.get("Access-Control-Allow-Origin")).toBe("https://koto.example");
  });

  it("emits all four directive tokens when cache arg is supplied (WEATHER_CACHE)", () => {
    const h = jsonResponseHeaders("https://koto.example", {
      maxAge: WEATHER_CACHE.BROWSER_MAX_AGE,
      sMaxAge: WEATHER_CACHE.SHARED_MAX_AGE,
      staleWhileRevalidate: WEATHER_CACHE.STALE_WHILE_REVALIDATE,
      staleIfError: WEATHER_CACHE.STALE_IF_ERROR,
    });
    const cc = h.get("Cache-Control")!;
    expect(cc).toContain("public");
    expect(cc).toContain(`max-age=${WEATHER_CACHE.BROWSER_MAX_AGE}`);
    expect(cc).toContain(`s-maxage=${WEATHER_CACHE.SHARED_MAX_AGE}`);
    expect(cc).toContain(`stale-while-revalidate=${WEATHER_CACHE.STALE_WHILE_REVALIDATE}`);
    expect(cc).toContain(`stale-if-error=${WEATHER_CACHE.STALE_IF_ERROR}`);
  });

  it("emits all four directive tokens when cache arg is supplied (POIS_CACHE)", () => {
    const h = jsonResponseHeaders("https://koto.example", {
      maxAge: POIS_CACHE.BROWSER_MAX_AGE,
      sMaxAge: POIS_CACHE.SHARED_MAX_AGE,
      staleWhileRevalidate: POIS_CACHE.STALE_WHILE_REVALIDATE,
      staleIfError: POIS_CACHE.STALE_IF_ERROR,
    });
    const cc = h.get("Cache-Control")!;
    expect(cc).toContain("public");
    expect(cc).toContain(`max-age=${POIS_CACHE.BROWSER_MAX_AGE}`);
    expect(cc).toContain(`s-maxage=${POIS_CACHE.SHARED_MAX_AGE}`);
    expect(cc).toContain(`stale-while-revalidate=${POIS_CACHE.STALE_WHILE_REVALIDATE}`);
    expect(cc).toContain(`stale-if-error=${POIS_CACHE.STALE_IF_ERROR}`);
  });

  it("emits no-cache instead of max-age=0 when maxAge is 0", () => {
    const h = jsonResponseHeaders("https://koto.example", {
      maxAge: 0,
      sMaxAge: POIS_CACHE.SHARED_MAX_AGE,
      staleWhileRevalidate: POIS_CACHE.STALE_WHILE_REVALIDATE,
      staleIfError: POIS_CACHE.STALE_IF_ERROR,
    });
    const cc = h.get("Cache-Control")!;
    expect(cc).toContain("no-cache");
    expect(cc).not.toContain("max-age=0");
  });
});

describe("getAllowedOrigin", () => {
  // Capture the original at describe-eval; it may be undefined.
  const original = process.env.NEXT_PUBLIC_SITE_URL;
  // Node coerces every assignment to process.env to a string, so writing
  // back a captured `undefined` would silently leave the literal "undefined"
  // string for sibling tests to read (T-16). Restore via `delete` instead.
  function restore() {
    if (original === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = original;
    }
  }

  it("returns the env value when set", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.app";
    try {
      expect(getAllowedOrigin()).toBe("https://example.app");
    } finally {
      restore();
    }
  });
  it("falls back to localhost when unset", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      expect(getAllowedOrigin()).toBe("http://localhost:3000");
    } finally {
      restore();
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
