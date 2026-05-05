import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { cachedFetchJson } from "./client-cache";
import { WEATHER_CACHE } from "@/config/cache";

const TestSchema = z.object({ value: z.number() });
type TestData = z.infer<typeof TestSchema>;

const FIXED_TIME = 1_000_000_000_000;
const CACHE_KEY = "test-key";
const STORAGE_KEY = `kc:cache:v1:${CACHE_KEY}`;
const TEST_URL = "/api/test";

function makeOpts(overrides: Partial<Parameters<typeof cachedFetchJson>[3]> = {}) {
  return {
    ttlMs: WEATHER_CACHE.CLIENT_TTL_MS,
    now: () => FIXED_TIME,
    ...overrides,
  };
}

function mockFetchOnce(data: TestData) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
}

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("cachedFetchJson", () => {
  it("fresh hit within ttlMs returns cached data without a second fetch", async () => {
    const payload: TestData = { value: 42 };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const opts = makeOpts();

    // First call — populates cache.
    const first = await cachedFetchJson(CACHE_KEY, TEST_URL, TestSchema, opts);
    expect(first).toEqual(payload);

    // Second call within ttlMs — must NOT issue another fetch.
    const second = await cachedFetchJson(CACHE_KEY, TEST_URL, TestSchema, opts);
    expect(second).toEqual(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cached value failing safeParse is discarded and re-fetched", async () => {
    // Seed sessionStorage with a corrupt entry that does not match TestSchema.
    const corrupt = JSON.stringify({ storedAt: FIXED_TIME, data: { value: "not-a-number" } });
    sessionStorage.setItem(STORAGE_KEY, corrupt);

    const freshPayload: TestData = { value: 99 };
    mockFetchOnce(freshPayload);

    const result = await cachedFetchJson(CACHE_KEY, TEST_URL, TestSchema, makeOpts());
    expect(result).toEqual(freshPayload);

    // Cache should now hold the fresh value.
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as { data: TestData };
    expect(stored.data).toEqual(freshPayload);
  });

  it("setItem throwing does not propagate — returns network result", async () => {
    const payload: TestData = { value: 7 };
    mockFetchOnce(payload);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    // Must not throw even when sessionStorage.setItem fails.
    const result = await cachedFetchJson(CACHE_KEY, TEST_URL, TestSchema, makeOpts());
    expect(result).toEqual(payload);
  });

  it("AbortError during fetch propagates and leaves sessionStorage unmodified", async () => {
    const controller = new AbortController();
    controller.abort();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("The operation was aborted."), { name: "AbortError" }),
      ),
    );

    await expect(
      cachedFetchJson(CACHE_KEY, TEST_URL, TestSchema, makeOpts({ signal: controller.signal })),
    ).rejects.toMatchObject({ name: "AbortError" });

    // sessionStorage must remain unmodified.
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("SSR mode — vi.stubGlobal window undefined — falls through to fetch", async () => {
    const payload: TestData = { value: 5 };
    mockFetchOnce(payload);

    // Simulate SSR by hiding window.
    vi.stubGlobal("window", undefined);
    try {
      const result = await cachedFetchJson(CACHE_KEY, TEST_URL, TestSchema, makeOpts());
      expect(result).toEqual(payload);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("expired entry is re-fetched and cache is replaced", async () => {
    const stalePayload: TestData = { value: 1 };
    const freshPayload: TestData = { value: 2 };

    // Seed with an entry that is older than ttlMs.
    const expiredEntry = JSON.stringify({
      storedAt: FIXED_TIME - WEATHER_CACHE.CLIENT_TTL_MS - 1,
      data: stalePayload,
    });
    sessionStorage.setItem(STORAGE_KEY, expiredEntry);

    mockFetchOnce(freshPayload);

    const result = await cachedFetchJson(CACHE_KEY, TEST_URL, TestSchema, makeOpts());
    expect(result).toEqual(freshPayload);

    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY)!) as { data: TestData; storedAt: number };
    expect(stored.data).toEqual(freshPayload);
    expect(stored.storedAt).toBe(FIXED_TIME);
  });
});
