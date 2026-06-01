import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { inMemoryKvStore } from "@/lib/proxy";

// ---------------------------------------------------------------------------
// Module mocks — must be at module scope before any imports of the route
// ---------------------------------------------------------------------------

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

vi.mock("@vercel/functions", () => ({
  ipAddress: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/opendata/db/client", () => ({
  openDatasetsDb: vi.fn().mockReturnValue({}),
}));

const mockBusData = {
  fetchedAt: "2026-01-01T00:00:00.000Z",
  feedVersion: "1",
  source: "https://example.com",
  license: { name: "CC BY", url: "https://example.com/license" },
  routes: [
    {
      routeId: "route-1",
      shortName: "東16",
      longName: "東京駅〜深川車庫",
      agencyId: "toei",
      directions: [
        {
          directionId: "0",
          headsign: "深川車庫",
          stopSequence: ["stop-a", "stop-b"],
          schedule: {
            weekday: [
              { stopId: "stop-a", times: ["06:00", "07:00"] },
              { stopId: "stop-b", times: ["06:10", "07:10"] },
            ],
            saturday: [
              { stopId: "stop-a", times: ["07:00"] },
              { stopId: "stop-b", times: ["07:10"] },
            ],
            sunday: [
              { stopId: "stop-a", times: ["08:00"] },
              { stopId: "stop-b", times: ["08:10"] },
            ],
          },
        },
      ],
    },
  ],
  stops: {
    "stop-a": { stopId: "stop-a", name: "東京駅", lat: 35.681, lng: 139.767 },
    "stop-b": { stopId: "stop-b", name: "深川車庫", lat: 35.672, lng: 139.803 },
  },
};

vi.mock("@/lib/opendata/db/readers", () => ({
  readBus: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import the route handler after mocks are established
// ---------------------------------------------------------------------------

import { GET, POST } from "./route";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/bus/stop-times", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-bind mocks to a fresh KV store so rate limit counters reset
    const fresh = inMemoryKvStore();
    const kvMod = await import("@vercel/kv");
    vi.mocked(kvMod.kv.get).mockImplementation((key: string) =>
      fresh.get(key),
    );
    vi.mocked(kvMod.kv.set).mockImplementation(
      (key: string, value: unknown, opts?: { ex?: number }) =>
        fresh.set(key, value, opts?.ex),
    );
    vi.mocked(kvMod.kv.incr).mockImplementation((key: string) =>
      fresh.incr(key),
    );
    vi.mocked(kvMod.kv.expire).mockImplementation(
      (key: string, ttl: number) => fresh.expire(key, ttl),
    );

    const { readBus } = await import("@/lib/opendata/db/readers");
    vi.mocked(readBus).mockResolvedValue(mockBusData as never);
  });

  // -------------------------------------------------------------------------
  // Method guard
  // -------------------------------------------------------------------------

  it("returns 405 for POST requests", async () => {
    const res = await POST();
    expect(res.status).toBe(405);
  });

  // -------------------------------------------------------------------------
  // Input validation
  // -------------------------------------------------------------------------

  it("returns 400 when stop param is missing", async () => {
    const req = makeRequest("https://my-koto.example.com/api/bus/stop-times");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for path-traversal stop param", async () => {
    const req = makeRequest(
      "https://my-koto.example.com/api/bus/stop-times?stop=../../../etc/passwd",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("returns 400 for stop param that is too long (>32 chars)", async () => {
    const longId = "a".repeat(33);
    const req = makeRequest(
      `https://my-koto.example.com/api/bus/stop-times?stop=${longId}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("returns 200 with correct StopTimesResponse shape for a valid stop", async () => {
    const req = makeRequest(
      "https://my-koto.example.com/api/bus/stop-times?stop=stop-a",
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.stopId).toBe("stop-a");
    expect(Array.isArray(body.routes)).toBe(true);
    expect(body.routes.length).toBeGreaterThan(0);

    const row = body.routes[0];
    expect(row.routeId).toBe("route-1");
    expect(row.shortName).toBe("東16");
    expect(row.directionId).toBe("0");
    expect(row.headsign).toBe("深川車庫");
    expect(Array.isArray(row.weekday)).toBe(true);
    expect(Array.isArray(row.saturday)).toBe(true);
    expect(Array.isArray(row.sunday)).toBe(true);
    expect(row.weekday).toEqual(["06:00", "07:00"]);
    expect(row.saturday).toEqual(["07:00"]);
    expect(row.sunday).toEqual(["08:00"]);
  });

  it("returns 404 for a stop ID that does not exist in the data", async () => {
    const req = makeRequest(
      "https://my-koto.example.com/api/bus/stop-times?stop=stop-zzz",
    );
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  it("allows 60 requests then returns 429 on the 61st", async () => {
    const freshKv = inMemoryKvStore();
    const kvMod = await import("@vercel/kv");
    vi.mocked(kvMod.kv.get).mockImplementation((key: string) =>
      freshKv.get(key),
    );
    vi.mocked(kvMod.kv.set).mockImplementation(
      (key: string, value: unknown, opts?: { ex?: number }) =>
        freshKv.set(key, value, opts?.ex),
    );
    vi.mocked(kvMod.kv.incr).mockImplementation((key: string) =>
      freshKv.incr(key),
    );
    vi.mocked(kvMod.kv.expire).mockImplementation(
      (key: string, ttl: number) => freshKv.expire(key, ttl),
    );

    const url = "https://my-koto.example.com/api/bus/stop-times?stop=stop-a";
    for (let i = 0; i < 60; i++) {
      const res = await GET(makeRequest(url));
      expect(res.status).not.toBe(429);
    }

    const res61 = await GET(makeRequest(url));
    expect(res61.status).toBe(429);
    expect(res61.headers.get("Retry-After")).not.toBeNull();
  });
});
