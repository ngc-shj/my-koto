import { describe, it, expect, vi, beforeEach } from "vitest";
import { inMemoryKvStore } from "@/lib/proxy";

// Module-scope mocks for KV + ipAddress() so the Edge route can run inside
// jsdom. Mirrors the pattern in app/api/weather/route.test.ts.
const sharedKvStore = inMemoryKvStore();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn((key: string) => sharedKvStore.get(key)),
    set: vi.fn((key: string, value: unknown, opts?: { ex?: number }) =>
      sharedKvStore.set(key, value, opts?.ex),
    ),
    incr: vi.fn((key: string) => sharedKvStore.incr(key)),
    expire: vi.fn((key: string, ttl: number) =>
      sharedKvStore.expire(key, ttl),
    ),
  },
}));

vi.mock("@vercel/functions", () => ({
  ipAddress: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { GET, POST, PUT, DELETE } from "./route";

const VALID_CSV = `,,2026050421,2026050424,2026050503
44132,2026/05/04 20:25, 140, 120, 100`;

function makeRequest(method = "GET"): Request {
  return new Request("https://my-koto.example.com/api/wbgt", { method });
}

describe("GET /api/wbgt", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const fresh = inMemoryKvStore();
    const kvMod = (await import("@vercel/kv")).kv;
    vi.mocked(kvMod.get).mockImplementation((key: string) => fresh.get(key));
    vi.mocked(kvMod.set).mockImplementation(
      (key: string, value: unknown, opts?: { ex?: number }) =>
        fresh.set(key, value, opts?.ex),
    );
    vi.mocked(kvMod.incr).mockImplementation((key: string) => fresh.incr(key));
    vi.mocked(kvMod.expire).mockImplementation((key: string, ttl: number) =>
      fresh.expire(key, ttl),
    );
  });

  it("returns 405 for non-GET methods", async () => {
    expect((await POST()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
  });

  it("fetches the forecast CSV at the canonical URL and returns parsed JSON", async () => {
    const callArgs: string[] = [];
    global.fetch = vi.fn((url: string | URL | Request) => {
      callArgs.push(typeof url === "string" ? url : url.toString());
      return Promise.resolve(
        new Response(VALID_CSV, {
          status: 200,
          headers: { "Content-Type": "text/csv" },
        }),
      );
    }) as typeof fetch;

    const res = await GET(makeRequest() as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    expect(callArgs[0]).toContain("www.wbgt.env.go.jp");
    expect(callArgs[0]).toContain("yohou_44132.csv");
    const body = (await res.json()) as {
      fetchedAt: string;
      readings: Array<{ wbgt: number; datetime: string }>;
    };
    expect(body.readings).toHaveLength(3);
    expect(body.readings[0].wbgt).toBeCloseTo(14.0, 5);
  });

  it("never forwards browser cookies to the upstream", async () => {
    const seenInit: RequestInit[] = [];
    global.fetch = vi.fn((_url, init?: RequestInit) => {
      if (init) seenInit.push(init);
      return Promise.resolve(
        new Response(VALID_CSV, {
          status: 200,
          headers: { "Content-Type": "text/csv" },
        }),
      );
    }) as typeof fetch;

    await GET(makeRequest() as import("next/server").NextRequest);
    const headers = seenInit[0]?.headers as Headers;
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
    expect(seenInit[0]?.redirect).toBe("manual");
  });

  it("returns 502 when upstream throws and no stale cache exists", async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error("network down")));
    const res = await GET(makeRequest() as import("next/server").NextRequest);
    expect(res.status).toBe(502);
  });

  it("falls back to stale KV cache on upstream failure (X-Cache: STALE)", async () => {
    // First request populates the cache.
    global.fetch = vi.fn().mockResolvedValue(
      new Response(VALID_CSV, {
        status: 200,
        headers: { "Content-Type": "text/csv" },
      }),
    );
    const ok = await GET(makeRequest() as import("next/server").NextRequest);
    expect(ok.status).toBe(200);

    // Second request — upstream gone, KV still warm.
    global.fetch = vi.fn(() => Promise.reject(new Error("network down")));
    const stale = await GET(makeRequest() as import("next/server").NextRequest);
    expect(stale.status).toBe(200);
    expect(stale.headers.get("X-Cache")).toBe("STALE");
  });

  it("returns 502 when upstream HTTP status is not 200", async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    const res = await GET(makeRequest() as import("next/server").NextRequest);
    expect(res.status).toBe(502);
  });
});
