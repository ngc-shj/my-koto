import { describe, expect, it, vi, beforeEach } from "vitest";
import { inMemoryKvStore } from "@/lib/proxy";

// Module-scope mocks. The subscribe route uses @vercel/kv directly for both
// rate-limit (incr/expire) and Set ops (sadd/smembers/srem). Both need
// implementations on the same mock object.
const rateLimitStore = inMemoryKvStore();
const sets = new Map<string, Set<string>>();
const values = new Map<string, unknown>();

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn((key: string) => {
      if (values.has(key)) return Promise.resolve(values.get(key));
      return rateLimitStore.get(key);
    }),
    set: vi.fn((key: string, value: unknown, opts?: { ex?: number }) => {
      if (opts?.ex !== undefined) return rateLimitStore.set(key, value, opts.ex);
      values.set(key, value);
      return Promise.resolve("OK");
    }),
    incr: vi.fn((key: string) => rateLimitStore.incr(key)),
    expire: vi.fn((key: string, ttl: number) => rateLimitStore.expire(key, ttl)),
    del: vi.fn((key: string) => {
      values.delete(key);
      return Promise.resolve(1);
    }),
    sadd: vi.fn((key: string, ...members: string[]) => {
      const set = sets.get(key) ?? new Set<string>();
      members.forEach((m) => set.add(m));
      sets.set(key, set);
      return Promise.resolve(members.length);
    }),
    srem: vi.fn((key: string, ...members: string[]) => {
      const set = sets.get(key);
      if (!set) return Promise.resolve(0);
      let removed = 0;
      members.forEach((m) => {
        if (set.delete(m)) removed += 1;
      });
      return Promise.resolve(removed);
    }),
    smembers: vi.fn((key: string) => {
      return Promise.resolve(Array.from(sets.get(key) ?? []));
    }),
  },
}));

vi.mock("@vercel/functions", () => ({
  ipAddress: vi.fn().mockReturnValue("127.0.0.1"),
}));

import { POST, DELETE, GET } from "./route";

function makeRequest(method: string, body?: unknown): Request {
  return new Request("https://koto-city.example.com/api/push/subscribe", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

const validBody = {
  subscription: {
    endpoint: "https://fcm.googleapis.com/fcm/send/test",
    keys: { p256dh: "BKd1abcd", auth: "abcdefgh" },
  },
  district: "toyosu",
  hour: 20,
};

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    sets.clear();
    values.clear();
    vi.clearAllMocks();
  });

  it("returns 405 for GET", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
  });

  it("accepts a valid subscription and stores it", async () => {
    const res = await POST(makeRequest("POST", validBody) as never);
    expect(res.status).toBe(200);
    expect(values.size).toBeGreaterThan(0);
    expect(sets.has(`push:bucket:toyosu:20`)).toBe(true);
  });

  it("rejects invalid JSON body", async () => {
    const req = new Request("https://x.example/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("rejects unknown district id", async () => {
    const res = await POST(
      makeRequest("POST", { ...validBody, district: "nowhereville" }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("rejects hours outside the configured range", async () => {
    const res = await POST(
      makeRequest("POST", { ...validBody, hour: 5 }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("rejects malformed endpoint URL", async () => {
    const bad = {
      ...validBody,
      subscription: { ...validBody.subscription, endpoint: "not-a-url" },
    };
    const res = await POST(makeRequest("POST", bad) as never);
    expect(res.status).toBe(400);
  });

  it("sets Cache-Control: no-store on success", async () => {
    const res = await POST(makeRequest("POST", validBody) as never);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    sets.clear();
    values.clear();
    vi.clearAllMocks();
  });

  it("removes a previously registered subscription", async () => {
    await POST(makeRequest("POST", validBody) as never);
    expect(sets.get(`push:bucket:toyosu:20`)?.size).toBe(1);

    const res = await DELETE(
      makeRequest("DELETE", { endpoint: validBody.subscription.endpoint }) as never,
    );
    expect(res.status).toBe(200);
    expect(sets.get(`push:bucket:toyosu:20`)?.size ?? 0).toBe(0);
  });

  it("is a no-op for unknown endpoints", async () => {
    const res = await DELETE(
      makeRequest("DELETE", { endpoint: "https://example.com/never-registered" }) as never,
    );
    expect(res.status).toBe(200);
  });
});
