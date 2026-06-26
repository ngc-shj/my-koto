import { describe, it, expect, vi, beforeEach } from "vitest";
import { inMemoryKvStore } from "@/lib/proxy";
import { JMA_QUAKE_CACHE } from "@/config/cache";

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
  url = "https://my-koto.example.com/api/jma-quakes",
  headers?: Record<string, string>,
): Request {
  return new Request(url, { method, headers });
}

// JmaQuakeListSchema requires eid, rdt, ttl (at/anm/mag/maxi/int are optional).
// buildQuakeFeed filters events by whether 江東区's city code appears in int[].city[].
const validQuakePayload = [
  {
    eid: "20260601120000",
    rdt: "2026-06-01T12:00:00+09:00",
    ttl: "震度３以上が観測されました",
    at: "2026-06-01T12:00:00+09:00",
    anm: "東京湾",
    mag: "4.2",
    maxi: "3",
    int: [
      {
        code: "13",
        maxi: "3",
        city: [
          {
            code: "1310800",
            maxi: "3",
          },
        ],
      },
    ],
  },
];

// Normalized QuakeFeed shape stored in KV
const staleQuakeData = {
  events: [
    {
      eventId: "20260601120000",
      title: "震度３以上が観測されました",
      reportDatetime: "2026-06-01T12:00:00+09:00",
      occurredAt: "2026-06-01T12:00:00+09:00",
      epicenter: "東京湾",
      magnitude: "4.2",
      maxShindo: "3",
      kotoShindo: "3",
    },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/jma-quakes", () => {
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
      (key: string, ttl: number) => fresh.expire(key, ttl).then(() => 1 as const),
    );
  });

  // -----------------------------------------------------------------------
  // Method guard
  // -----------------------------------------------------------------------

  it("returns 405 for POST requests", async () => {
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
  // Response headers
  // -----------------------------------------------------------------------

  it("returns Cache-Control with s-maxage and stale-if-error on 200", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validQuakePayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);

    const cc = res.headers.get("Cache-Control")!;
    expect(cc).toContain(`s-maxage=${JMA_QUAKE_CACHE.SHARED_MAX_AGE}`);
    expect(cc).toContain(`stale-if-error=${JMA_QUAKE_CACHE.STALE_IF_ERROR}`);
    expect(cc).toContain(`max-age=${JMA_QUAKE_CACHE.BROWSER_MAX_AGE}`);
    expect(cc).toContain(`stale-while-revalidate=${JMA_QUAKE_CACHE.STALE_WHILE_REVALIDATE}`);
  });

  it("returns Vary: Accept-Encoding", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validQuakePayload), {
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
      new Response(JSON.stringify(validQuakePayload), {
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
    // Pre-populate KV with valid normalized stale data
    const kv = await import("@vercel/kv");
    const staleKey = "jma-quake:v1:1310800";
    await (kv.kv.set as ReturnType<typeof vi.fn>)(staleKey, staleQuakeData);

    // Upstream fails
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const req = makeRequest("GET");
    const res = await GET(req as import("next/server").NextRequest);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("STALE");
    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events[0].eventId).toBe("20260601120000");
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
  // Upstream response validation
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

  // -----------------------------------------------------------------------
  // Rate limiting
  // -----------------------------------------------------------------------

  it("allows 60 requests from same IP then returns 429 on 61st", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(validQuakePayload), {
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
      (key: string, ttl: number) => freshKv.expire(key, ttl).then(() => 1 as const),
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
});
