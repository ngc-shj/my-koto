import { describe, expect, it } from "vitest";
import {
  deleteSubscription,
  deriveSubId,
  getSubscription,
  listBucket,
  saveSubscription,
  type PushKv,
} from "./storage";
import type { PushSubscriptionRecord } from "./types";

function makeKv(): PushKv {
  const values = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();
  return {
    async get<T>(key: string): Promise<T | null> {
      return values.has(key) ? (values.get(key) as T) : null;
    },
    async set<T>(key: string, value: T): Promise<unknown> {
      values.set(key, value);
      return "OK";
    },
    async del(key: string): Promise<unknown> {
      values.delete(key);
      return 1;
    },
    async sadd(key: string, ...members: string[]): Promise<number> {
      const set = sets.get(key) ?? new Set<string>();
      let added = 0;
      for (const m of members) {
        if (!set.has(m)) added += 1;
        set.add(m);
      }
      sets.set(key, set);
      return added;
    },
    async srem(key: string, ...members: string[]): Promise<number> {
      const set = sets.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const m of members) {
        if (set.delete(m)) removed += 1;
      }
      return removed;
    },
    async smembers(key: string): Promise<string[]> {
      return Array.from(sets.get(key) ?? []);
    },
  };
}

function makeRecord(
  overrides: Partial<PushSubscriptionRecord> = {},
): PushSubscriptionRecord {
  return {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    p256dh: "BKd1...truncatedfortest",
    auth: "abcdefgh",
    district: "toyosu",
    hour: 20,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("deriveSubId", () => {
  it("is deterministic for the same endpoint", async () => {
    const a = await deriveSubId("https://example.com/endpoint/1");
    const b = await deriveSubId("https://example.com/endpoint/1");
    expect(a).toBe(b);
  });

  it("differs across endpoints", async () => {
    const a = await deriveSubId("https://example.com/endpoint/1");
    const b = await deriveSubId("https://example.com/endpoint/2");
    expect(a).not.toBe(b);
  });
});

describe("saveSubscription", () => {
  it("persists the record and indexes it in district+hour bucket", async () => {
    const kv = makeKv();
    const record = makeRecord();
    const subId = await saveSubscription(kv, record);

    expect(await getSubscription(kv, subId)).toEqual(record);
    expect(await listBucket(kv, "toyosu", 20)).toContain(subId);
  });

  it("is idempotent: re-saving same endpoint overwrites without duplicate bucket entries", async () => {
    const kv = makeKv();
    const record = makeRecord();
    const id1 = await saveSubscription(kv, record);
    const id2 = await saveSubscription(kv, record);
    expect(id1).toBe(id2);
    const bucket = await listBucket(kv, "toyosu", 20);
    expect(bucket).toEqual([id1]);
  });

  it("re-buckets when district or hour changes", async () => {
    const kv = makeKv();
    const subId = await saveSubscription(kv, makeRecord());
    expect(await listBucket(kv, "toyosu", 20)).toContain(subId);

    await saveSubscription(
      kv,
      makeRecord({ district: "kameido-1-3", hour: 19 }),
    );
    expect(await listBucket(kv, "toyosu", 20)).toEqual([]);
    expect(await listBucket(kv, "kameido-1-3", 19)).toContain(subId);
  });
});

describe("deleteSubscription", () => {
  it("removes the record and bucket membership", async () => {
    const kv = makeKv();
    const subId = await saveSubscription(kv, makeRecord());
    const removed = await deleteSubscription(kv, subId);

    expect(removed).toBe(true);
    expect(await getSubscription(kv, subId)).toBeNull();
    expect(await listBucket(kv, "toyosu", 20)).toEqual([]);
  });

  it("returns false for unknown subId without throwing", async () => {
    const kv = makeKv();
    const removed = await deleteSubscription(kv, "nonexistent");
    expect(removed).toBe(false);
  });
});
