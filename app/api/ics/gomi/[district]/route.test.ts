import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation to capture notFound() calls.
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

// In-memory @vercel/kv stub so the rate-limit pipeline operates against a
// deterministic backing store inside the test process.
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

function makeRequest(district: string): [Request, { params: Promise<{ district: string }> }] {
  const req = new Request(`https://example.com/api/ics/gomi/${district}`);
  const params = Promise.resolve({ district });
  return [req, { params }];
}

async function callGET(district: string): Promise<Response | null> {
  try {
    const [req, ctx] = makeRequest(district);
    return await GET(req, ctx);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "NEXT_NOT_FOUND") {
      return null;
    }
    throw e;
  }
}

describe("GET /api/ics/gomi/[district]", () => {
  beforeEach(() => {
    memory.clear();
    vi.clearAllMocks();
  });

  it("returns 200 with text/calendar for valid allowlist district kameido-1-3", async () => {
    const res = await callGET("kameido-1-3");
    expect(res).not.toBeNull();
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Content-Type")).toContain("text/calendar");
  });

  it("returns valid ICS body with VCALENDAR for kameido-1-3", async () => {
    const res = await callGET("kameido-1-3");
    expect(res).not.toBeNull();
    const body = await res!.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
    expect(body).toContain("TZID:Asia/Tokyo");
  });

  it("returns Content-Disposition attachment header for kameido-1-3", async () => {
    const res = await callGET("kameido-1-3");
    expect(res).not.toBeNull();
    const cd = res?.headers.get("Content-Disposition");
    expect(cd).toContain("attachment");
    expect(cd).toContain("kameido-1-3");
  });

  it("returns 404 for kameido-99 (valid characters, not in allowlist)", async () => {
    const res = await callGET("kameido-99");
    expect(res).toBeNull();
  });

  it("returns 404 for '..' (directory traversal attempt)", async () => {
    const res = await callGET("..");
    expect(res).toBeNull();
  });

  it("returns 404 for 'KAMEIDO-1' (uppercase — not in allowlist)", async () => {
    const res = await callGET("KAMEIDO-1");
    expect(res).toBeNull();
  });

  it("returns 404 for empty string", async () => {
    const res = await callGET("");
    expect(res).toBeNull();
  });

  it("returns 404 for string containing Cyrillic 'о' lookalike", async () => {
    // Cyrillic о (U+043E) looks like Latin o but fails /^[a-z0-9-]{1,32}$/
    const res = await callGET("kameidо-1");
    expect(res).toBeNull();
  });

  it("returns 404 for a string longer than 32 characters", async () => {
    const res = await callGET("a".repeat(33));
    expect(res).toBeNull();
  });

  it("returns 429 with Retry-After once the per-IP budget is exhausted (T-11 / S-03)", async () => {
    // 60 rpm/IP — first 60 succeed, 61st is throttled.
    for (let i = 0; i < 60; i += 1) {
      const ok = await callGET("kameido-1-3");
      expect(ok?.status).toBe(200);
    }
    const denied = await callGET("kameido-1-3");
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(429);
    expect(denied!.headers.get("Retry-After")).not.toBeNull();
  });
});
