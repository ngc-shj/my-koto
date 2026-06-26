import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { inMemoryKvStore } from "@/lib/proxy";
import { MAP_BUS_CACHE } from "@/config/cache";

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

import { GET, POST, PUT, DELETE } from "./route";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRequest(url = "https://my-koto.example.com/api/map/bus"): NextRequest {
  return new NextRequest(new URL(url));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/map/bus", () => {
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
      (key: string, ttl: number) => fresh.expire(key, ttl).then(() => 1 as const),
    );

    const { readBus } = await import("@/lib/opendata/db/readers");
    vi.mocked(readBus).mockResolvedValue(mockBusData as never);
  });

  // -------------------------------------------------------------------------
  // Method guards
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it("returns 200 with bus data on successful GET", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.routes).toBeDefined();
    expect(body.stops).toBeDefined();
    expect(Array.isArray(body.routes)).toBe(true);
  });

  it("returns Cache-Control with s-maxage and stale-if-error on 200", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);

    const cc = res.headers.get("Cache-Control")!;
    expect(cc).toContain(`s-maxage=${MAP_BUS_CACHE.SHARED_MAX_AGE}`);
    expect(cc).toContain(`stale-if-error=${MAP_BUS_CACHE.STALE_IF_ERROR}`);
    expect(cc).toContain(`max-age=${MAP_BUS_CACHE.BROWSER_MAX_AGE}`);
    expect(cc).toContain(`stale-while-revalidate=${MAP_BUS_CACHE.STALE_WHILE_REVALIDATE}`);
  });

  // -------------------------------------------------------------------------
  // Error handling — must not leak internal details
  // -------------------------------------------------------------------------

  it("returns 503 with fixed error message when readBus throws", async () => {
    const { readBus } = await import("@/lib/opendata/db/readers");
    vi.mocked(readBus).mockRejectedValue(
      new Error("SQLITE_ERROR: no such table: datasets"),
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);

    const body = await res.json();
    // Must not leak internal error details
    expect(body.error).toBe("Bus bundle unavailable");
    expect(body.error).not.toContain("SQLITE");
    expect(body.error).not.toContain("datasets");
  });

  it("503 response carries Cache-Control: no-store", async () => {
    const { readBus } = await import("@/lib/opendata/db/readers");
    vi.mocked(readBus).mockRejectedValue(new Error("db failure"));

    const res = await GET(makeRequest());
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // -------------------------------------------------------------------------
  // Rate limiting
  // -------------------------------------------------------------------------

  it("allows 30 requests then returns 429 on the 31st", async () => {
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
      (key: string, ttl: number) => freshKv.expire(key, ttl).then(() => 1 as const),
    );

    for (let i = 0; i < 30; i++) {
      const res = await GET(makeRequest());
      expect(res.status).not.toBe(429);
    }

    const res31 = await GET(makeRequest());
    expect(res31.status).toBe(429);
    expect(res31.headers.get("Retry-After")).not.toBeNull();
  });
});
