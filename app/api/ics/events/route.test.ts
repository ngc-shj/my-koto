import { describe, it, expect, vi, beforeEach } from "vitest";

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

// Stub the libsql reader so tests don't open a real database.
vi.mock("@/lib/opendata/db/client", () => ({
  openDatasetsDb: vi.fn(() => ({})),
}));
vi.mock("@/lib/opendata/db/readers", () => ({
  readEvents: vi.fn(async () => ({
    result: {
      records: [
        {
          名称: "テストイベント",
          // Pin to today + a year so filterUpcoming always keeps it.
          開始日: new Date(Date.now() + 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10),
        },
      ],
    },
  })),
}));

import { GET } from "./route";

beforeEach(() => {
  memory.clear();
  vi.restoreAllMocks();
});

function makeReq(): Request {
  return new Request("https://example.com/api/ics/events");
}

describe("GET /api/ics/events", () => {
  it("returns 200 with text/calendar Content-Type on the happy path", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
  });

  it("attaches a Content-Disposition that prompts download", async () => {
    const res = await GET(makeReq());
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain("koto-events.ics");
  });

  it("emits a VCALENDAR envelope", async () => {
    const res = await GET(makeReq());
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
  });

  it("denies the 61st request in a window with 429 + Retry-After (S-03 boundary)", async () => {
    // Bucket budget is 60 rpm/IP (T-10 verifies the limiter is wired in).
    for (let i = 0; i < 60; i += 1) {
      const ok = await GET(makeReq());
      expect(ok.status).toBe(200);
    }
    const denied = await GET(makeReq());
    expect(denied.status).toBe(429);
    expect(denied.headers.get("Retry-After")).not.toBeNull();
  });
});
