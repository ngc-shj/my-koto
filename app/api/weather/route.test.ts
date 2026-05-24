import { describe, it, expect, vi, beforeEach } from "vitest";
import { inMemoryKvStore, lruFallbackKvStore } from "@/lib/proxy";
import { WEATHER_CACHE } from "@/config/cache";

// ---------------------------------------------------------------------------
// Module mocks — must be at module scope before any imports of the route
// ---------------------------------------------------------------------------

// Mock @vercel/kv to avoid requiring real KV credentials
const mockKvStore = inMemoryKvStore();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn((key: string) => mockKvStore.get(key)),
    set: vi.fn((key: string, value: unknown, opts?: { ex?: number }) =>
      mockKvStore.set(key, value, opts?.ex),
    ),
    incr: vi.fn((key: string) => mockKvStore.incr(key)),
    expire: vi.fn((key: string, ttl: number) => mockKvStore.expire(key, ttl)),
  },
}));

// Mock @vercel/functions ipAddress
vi.mock("@vercel/functions", () => ({
  ipAddress: vi.fn().mockReturnValue("127.0.0.1"),
}));

// ---------------------------------------------------------------------------
// Import the route handler after mocks are established
// ---------------------------------------------------------------------------

import { GET, POST, PUT, DELETE } from "./route";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRequest(
  method: string,
  url = "https://my-koto.example.com/api/weather",
  headers?: Record<string, string>,
): Request {
  return new Request(url, { method, headers });
}

const validWeatherPayload = {
  latitude: 35.6727,
  longitude: 139.8175,
  timezone: "Asia/Tokyo",
  hourly: {
    time: ["2026-08-01T00:00"],
    temperature_2m: [30.5],
    precipitation_probability: [20],
  },
  daily: {
    time: ["2026-08-01"],
    temperature_2m_max: [35.0],
    temperature_2m_min: [25.0],
    precipitation_probability_max: [30],
    weathercode: [1],
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/weather", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset KV store before each test
    const fresh = inMemoryKvStore();
    const kvMod = (await import("@vercel/kv")).kv;
    vi.mocked(kvMod.get).mockImplementation((key: string) =>
      fresh.get(key),
    );
    vi.mocked(kvMod.set).mockImplementation(
      (key: string, value: unknown, opts?: { ex?: number }) =>
        fresh.set(key, value, opts?.ex),
    );
    vi.mocked(kvMod.incr).mockImplementation((key: string) =>
      fresh.incr(key),
    );
    vi.mocked(kvMod.expire).mockImplementation(
      (key: string, ttl: number) => fresh.expire(key, ttl),
    );
  });

  // -----------------------------------------------------------------------
  // Method guard
  // -----------------------------------------------------------------------

  it("returns 405 for POST requests", async () => {
    const req = makeRequest("POST");
    const res = await POST();
    expect(res.status).toBe(405);
  });

  it("returns 405 for PUT requests", async () => {
    const res = await PUT();
    expect(res.status).toBe(405);
  });

  it("returns 405 for DELETE requests", async () => {
    const res = await DELETE();
    expect(res.status).toBe(405);
  });

  // -----------------------------------------------------------------------
  // Input parameter isolation (SSRF hardening)
  // -----------------------------------------------------------------------

  it("does not use ?lat= query param (ignores user input for coordinates)", async () => {
    const callArgs: string[] = [];
    global.fetch = vi.fn((url: string | URL | Request) => {
      callArgs.push(typeof url === "string" ? url : url.toString());
      return Promise.resolve(
        new Response(JSON.stringify(validWeatherPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const req = makeRequest("GET", "https://my-koto.example.com/api/weather?lat=99&lng=99");
    await GET(req as import("next/server").NextRequest);

    expect(callArgs[0]).toContain("latitude=35.6727");
    expect(callArgs[0]).toContain("longitude=139.8175");
    expect(callArgs[0]).not.toContain("lat=99");
  });

  it("does not use ?url= query param (SSRF prevention)", async () => {
    const callArgs: string[] = [];
    global.fetch = vi.fn((url: string | URL | Request) => {
      callArgs.push(typeof url === "string" ? url : url.toString());
      return Promise.resolve(
        new Response(JSON.stringify(validWeatherPayload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;

    const req = makeRequest(
      "GET",
      "https://my-koto.example.com/api/weather?url=https://evil.com",
    );
    await GET(req as import("next/server").NextRequest);

    // Must not fetch evil.com
    expect(callArgs[0]).not.toContain("evil.com");
    expect(callArgs[0]).toContain("api.open-meteo.com");
  });

  // -----------------------------------------------------------------------
  // Response headers
  // -----------------------------------------------------------------------

  it("returns Cache-Control with s-maxage and stale-if-error on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validWeatherPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);

    const cc = res.headers.get("Cache-Control")!;
    expect(cc).toContain(`s-maxage=${WEATHER_CACHE.SHARED_MAX_AGE}`);
    expect(cc).toContain(`stale-if-error=${WEATHER_CACHE.STALE_IF_ERROR}`);
    expect(cc).toContain(`max-age=${WEATHER_CACHE.BROWSER_MAX_AGE}`);
    expect(cc).toContain(`stale-while-revalidate=${WEATHER_CACHE.STALE_WHILE_REVALIDATE}`);
  });

  it("returns Vary: Accept-Encoding", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validWeatherPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);

    expect(res.headers.get("Vary")).toBe("Accept-Encoding");
  });

  it("returns Access-Control-Allow-Origin (not a wildcard)", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validWeatherPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);

    const acao = res.headers.get("Access-Control-Allow-Origin");
    expect(acao).not.toBeNull();
    expect(acao).not.toBe("*");
  });

  // -----------------------------------------------------------------------
  // Upstream error → stale-if-error from KV
  // -----------------------------------------------------------------------

  it("returns stale KV data when upstream fails (stale-if-error)", async () => {
    // Pre-populate KV with valid stale data
    const kv = await import("@vercel/kv");
    const staleKey = "weather:v1:koto-center";
    await (kv.kv.set as ReturnType<typeof vi.fn>)(staleKey, validWeatherPayload);

    // Upstream fails
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("STALE");
    const body = await res.json();
    expect(body.timezone).toBe("Asia/Tokyo");
  });

  it("returns 502 when upstream fails and KV has no stale data", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);
    expect(res.status).toBe(502);
  });

  it("502 response carries Cache-Control: no-store", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // -----------------------------------------------------------------------
  // Rate limiting (T17)
  // -----------------------------------------------------------------------

  it("allows 60 requests from same IP then returns 429 on 61st", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validWeatherPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    // Use a single fresh KV for this test
    const freshKv = inMemoryKvStore();
    const kvMod = await import("@vercel/kv");
    (kvMod.kv.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      freshKv.get(key),
    );
    (kvMod.kv.set as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string, value: unknown, opts?: { ex?: number }) =>
        freshKv.set(key, value, opts?.ex),
    );
    (kvMod.kv.incr as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      freshKv.incr(key),
    );
    (kvMod.kv.expire as ReturnType<typeof vi.fn>).mockImplementation(
      (key: string, ttl: number) => freshKv.expire(key, ttl),
    );

    // 60 allowed requests
    for (let i = 0; i < 60; i++) {
      const res = await GET(makeRequest("GET") as import("next/server").NextRequest);
      expect(res.status).not.toBe(429);
    }

    // 61st request should be rejected
    const res61 = await GET(makeRequest("GET") as import("next/server").NextRequest);
    expect(res61.status).toBe(429);
    expect(res61.headers.get("Retry-After")).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // Upstream response validation (SSRF hardening / CRC checks)
  // -----------------------------------------------------------------------

  it("returns 502 when upstream Content-Type is not application/json", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response("<html>error</html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream body fails Zod schema validation", async () => {
    const invalidPayload = {
      latitude: 35.6727,
      longitude: 139.8175,
      timezone: "Asia/Tokyo",
      hourly: {
        time: ["2026-08-01T00:00"],
        temperature_2m: [99999], // exceeds max(50)
      },
    };

    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(invalidPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream Content-Length exceeds 256KB", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validWeatherPayload), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(256 * 1024 + 1),
        },
      }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream returns non-OK status", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 503 }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);
    // No stale in KV, so 502
    expect(res.status).toBe(502);
  });
});
