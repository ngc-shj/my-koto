import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  inMemoryKvStore,
  lruFallbackKvStore,
  withFallback,
  enforceRateLimit,
  kvKey,
  parseSchemaVersion,
  getClientIp,
} from "./proxy";

// ---------------------------------------------------------------------------
// inMemoryKvStore
// ---------------------------------------------------------------------------

describe("inMemoryKvStore", () => {
  it("get returns null for missing key", async () => {
    const kv = inMemoryKvStore();
    expect(await kv.get("missing")).toBeNull();
  });

  it("set and get round-trips a value", async () => {
    const kv = inMemoryKvStore();
    await kv.set("foo", { hello: "world" });
    expect(await kv.get("foo")).toEqual({ hello: "world" });
  });

  it("set with TTL expires entry after elapsed time", async () => {
    const kv = inMemoryKvStore();
    // Set 1s TTL then advance Date.now via vi.setSystemTime
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    await kv.set("ttlKey", "value", 1);

    // Still valid at t=999ms
    vi.setSystemTime(new Date(now.getTime() + 999));
    expect(await kv.get("ttlKey")).toBe("value");

    // Expired at t=1000ms
    vi.setSystemTime(new Date(now.getTime() + 1000));
    expect(await kv.get("ttlKey")).toBeNull();

    vi.useRealTimers();
  });

  it("incr increments counter sequentially", async () => {
    const kv = inMemoryKvStore();
    expect(await kv.incr("counter")).toBe(1);
    expect(await kv.incr("counter")).toBe(2);
    expect(await kv.incr("counter")).toBe(3);
  });

  it("incr is isolated per key", async () => {
    const kv = inMemoryKvStore();
    await kv.incr("a");
    await kv.incr("a");
    await kv.incr("b");
    expect(await kv.incr("a")).toBe(3);
    expect(await kv.incr("b")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// enforceRateLimit (T17)
// ---------------------------------------------------------------------------

describe("enforceRateLimit", () => {
  it("allows exactly limit requests (60 req OK)", async () => {
    const kv = inMemoryKvStore();
    for (let i = 1; i <= 60; i++) {
      const result = await enforceRateLimit(kv, "rl:ip:1.2.3.4", 60, 60);
      expect(result.ok).toBe(true);
    }
  });

  it("returns ok=false with retryAfter on the 61st request (T17)", async () => {
    const kv = inMemoryKvStore();
    for (let i = 0; i < 60; i++) {
      await enforceRateLimit(kv, "rl:ip:1.2.3.4", 60, 60);
    }
    const result = await enforceRateLimit(kv, "rl:ip:1.2.3.4", 60, 60);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryAfter).toBe(60);
    }
  });

  it("uses separate buckets per key", async () => {
    const kv = inMemoryKvStore();
    // Fill bucket for ip1 to limit
    for (let i = 0; i < 60; i++) {
      await enforceRateLimit(kv, "rl:ip:1.1.1.1", 60, 60);
    }
    // ip2 should still be allowed
    const result = await enforceRateLimit(kv, "rl:ip:2.2.2.2", 60, 60);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lruFallbackKvStore
// ---------------------------------------------------------------------------

describe("lruFallbackKvStore", () => {
  it("stores and retrieves values", async () => {
    const kv = lruFallbackKvStore();
    await kv.set("k", "v");
    expect(await kv.get("k")).toBe("v");
  });

  it("incr works", async () => {
    const kv = lruFallbackKvStore();
    expect(await kv.incr("c")).toBe(1);
    expect(await kv.incr("c")).toBe(2);
  });

  it("evicts oldest entry when maxEntries is exceeded", async () => {
    const kv = lruFallbackKvStore(3);
    await kv.set("a", 1);
    await kv.set("b", 2);
    await kv.set("c", 3);
    // Adding "d" should evict "a"
    await kv.set("d", 4);
    expect(await kv.get("a")).toBeNull();
    expect(await kv.get("d")).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// withFallback: switches to fallback on primary failure
// ---------------------------------------------------------------------------

describe("withFallback", () => {
  it("switches to fallback when primary incr throws", async () => {
    const primary = inMemoryKvStore();
    const fallback = inMemoryKvStore();
    const notify = vi.fn();

    // Override primary.incr to throw
    const brokenPrimary = {
      ...primary,
      incr: vi.fn().mockRejectedValue(new Error("KV unavailable")),
    };

    const kv = withFallback(brokenPrimary, fallback, notify);
    const result = await kv.incr("counter");

    expect(result).toBe(1); // fallback provides 1
    expect(notify).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("KV primary failure"),
    );
  });

  it("uses primary when it succeeds", async () => {
    const primary = inMemoryKvStore();
    const fallback = inMemoryKvStore();
    const notify = vi.fn();

    const kv = withFallback(primary, fallback, notify);
    await kv.set("x", 42);
    expect(await kv.get("x")).toBe(42);
    expect(notify).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// kvKey
// ---------------------------------------------------------------------------

describe("kvKey", () => {
  it("builds a namespace:vN:parts key", () => {
    expect(kvKey("weather", 1, "koto-center")).toBe("weather:v1:koto-center");
  });

  it("builds a key with multiple parts", () => {
    expect(kvKey("rl", 2, "weather", "1.2.3.4")).toBe("rl:v2:weather:1.2.3.4");
  });

  it("builds a key with no parts", () => {
    expect(kvKey("weather", 1)).toBe("weather:v1");
  });

  it("includes schema version in key (S20)", () => {
    const v1 = kvKey("weather", 1, "path");
    const v2 = kvKey("weather", 2, "path");
    expect(v1).not.toBe(v2);
    expect(v1).toContain(":v1:");
    expect(v2).toContain(":v2:");
  });
});

// ---------------------------------------------------------------------------
// parseSchemaVersion
// ---------------------------------------------------------------------------

describe("parseSchemaVersion", () => {
  it("defaults to 1 when env is unset", () => {
    const original = process.env.KV_SCHEMA_VERSION;
    delete process.env.KV_SCHEMA_VERSION;
    expect(parseSchemaVersion()).toBe(1);
    if (original !== undefined) process.env.KV_SCHEMA_VERSION = original;
  });

  it("reads from KV_SCHEMA_VERSION env variable", () => {
    const original = process.env.KV_SCHEMA_VERSION;
    process.env.KV_SCHEMA_VERSION = "3";
    expect(parseSchemaVersion()).toBe(3);
    if (original !== undefined) {
      process.env.KV_SCHEMA_VERSION = original;
    } else {
      delete process.env.KV_SCHEMA_VERSION;
    }
  });
});

// ---------------------------------------------------------------------------
// getClientIp — does NOT trust raw X-Forwarded-For (S18)
// ---------------------------------------------------------------------------

// Mock @vercel/functions to control ipAddress() behavior
vi.mock("@vercel/functions", () => ({
  ipAddress: vi.fn(),
}));

describe("getClientIp", () => {
  beforeEach(async () => {
    const mod = await import("@vercel/functions");
    vi.mocked(mod.ipAddress).mockReturnValue(undefined);
  });

  it("returns 0.0.0.0 when Vercel IP header is absent", async () => {
    // ipAddress() returns undefined (no Vercel edge header)
    const req = new Request("https://example.com/api/weather", {
      headers: {
        "X-Forwarded-For": "evil.attacker.com, 1.2.3.4",
      },
    });
    expect(getClientIp(req)).toBe("0.0.0.0");
  });

  it("returns the verified Vercel IP, not the XFF header (S18)", async () => {
    const { ipAddress } = await import("@vercel/functions");
    vi.mocked(ipAddress).mockReturnValue("10.0.0.1");

    const req = new Request("https://example.com/api/weather", {
      headers: {
        // Attacker-controlled XFF — should be ignored
        "X-Forwarded-For": "1.2.3.4, 5.6.7.8",
      },
    });

    expect(getClientIp(req)).toBe("10.0.0.1");
  });
});
