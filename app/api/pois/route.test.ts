import { describe, it, expect, vi, beforeEach } from "vitest";
import { POIS_CACHE } from "@/config/cache";

// In-memory @vercel/kv stub before route imports.
const memory = new Map<string, unknown>();
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
    expire: vi.fn(async () => {}),
  },
}));

import { GET } from "./route";

beforeEach(() => {
  memory.clear();
  vi.restoreAllMocks();
});

function makeReq(query: string): Request {
  return new Request(`https://example.com/api/pois?${query}`);
}

describe("GET /api/pois", () => {
  it("returns 400 when bbox is missing", async () => {
    const res = await GET(makeReq("") as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when bbox is malformed", async () => {
    const res = await GET(makeReq("bbox=not,a,bbox") as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 when south >= north", async () => {
    const res = await GET(
      makeReq("bbox=35.70,139.79,35.65,139.85") as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when bbox is outside Tokyo 23 wards", async () => {
    // Yokohama-ish coords — outside Tokyo 23 envelope.
    const res = await GET(
      makeReq("bbox=35.40,139.50,35.45,139.55") as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when bbox area exceeds limit", async () => {
    // 0.5° × 0.5° well above the 0.04 deg² cap.
    const res = await GET(
      makeReq("bbox=35.55,139.60,35.85,139.90") as never,
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when types contains an unknown value", async () => {
    const res = await GET(
      makeReq("bbox=35.65,139.75,35.70,139.80&types=cafe") as never,
    );
    expect(res.status).toBe(400);
  });

  it("accepts Phase 1 disaster layer ids in types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ elements: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const res = await GET(
      makeReq(
        "bbox=35.65,139.75,35.70,139.80&types=shelter,assembly_point,water_supply",
      ) as never,
    );
    expect(res.status).toBe(200);
  });

  it("calls upstream Overpass with redirect:manual and proper headers", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ elements: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await GET(
      makeReq("bbox=35.65,139.75,35.70,139.80&types=aed") as never,
    );
    expect(res.status).toBe(200);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("manual");
    const headers = init.headers as Headers;
    expect(headers.get("User-Agent")).toContain("my-koto");
    // Sensitive headers must NOT be forwarded.
    expect(headers.get("Cookie")).toBeNull();
    expect(headers.get("Authorization")).toBeNull();
    expect(headers.get("X-Forwarded-For")).toBeNull();
  });

  it("rejects upstream non-JSON content-type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>", {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }),
      ),
    );
    const res = await GET(
      makeReq("bbox=35.65,139.75,35.70,139.80&types=aed") as never,
    );
    expect(res.status).toBe(502);
  });

  it("returns 502 when upstream throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    const res = await GET(
      makeReq("bbox=35.65,139.75,35.70,139.80&types=aed") as never,
    );
    expect(res.status).toBe(502);
  });

  it("200 response carries browser-cacheable Cache-Control directives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ elements: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    const res = await GET(
      makeReq("bbox=35.65,139.75,35.70,139.80&types=aed") as never,
    );
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control")!;
    expect(cc).toContain(`max-age=${POIS_CACHE.BROWSER_MAX_AGE}`);
    expect(cc).toContain(`s-maxage=${POIS_CACHE.SHARED_MAX_AGE}`);
    expect(cc).toContain(`stale-while-revalidate=${POIS_CACHE.STALE_WHILE_REVALIDATE}`);
    expect(cc).toContain(`stale-if-error=${POIS_CACHE.STALE_IF_ERROR}`);
  });

  it("400 response carries Cache-Control: no-store", async () => {
    const res = await GET(makeReq("bbox=not,a,bbox") as never);
    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("502 response carries Cache-Control: no-store", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network");
      }),
    );
    const res = await GET(
      makeReq("bbox=35.65,139.75,35.70,139.80&types=aed") as never,
    );
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("maps Overpass elements into MapPoint records", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              elements: [
                {
                  type: "node",
                  id: 100,
                  lat: 35.69,
                  lon: 139.69,
                  tags: { amenity: "toilets", name: "新宿駅西口公衆便所" },
                },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );
    const res = await GET(
      makeReq("bbox=35.65,139.75,35.70,139.80&types=toilet") as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { records: unknown[]; source: string };
    expect(body.source).toBe("osm");
    expect(body.records).toHaveLength(1);
  });
});
