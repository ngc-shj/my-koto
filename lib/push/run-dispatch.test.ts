import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/kv", () => ({ kv: {} }));

import { runDispatch } from "@/lib/push/run-dispatch";
import {
  saveSubscription,
  type PushKv,
} from "@/lib/push/storage";
import type { PushSubscriptionRecord } from "@/lib/push/types";
import type { Sender } from "@/lib/push/sender";

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
    p256dh: "BKd1abcdefghijklmnopqrstuvwxyz",
    auth: "abcdefgh",
    district: "toyosu",
    hour: 20,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

// 2026-05-03 (Sun) JST 20:00 = 2026-05-03 11:00 UTC.
// Tomorrow JST = 2026-05-04 (Mon). Toyosu's schedule has burnable on Mon.
const SUN_EVENING_UTC = new Date("2026-05-03T11:00:00Z");

describe("runDispatch", () => {
  it("returns zero attempts when no buckets are populated", async () => {
    const kv = makeKv();
    const send = vi.fn<Sender>(async () => ({ ok: true }));
    const summary = await runDispatch({ kv, now: SUN_EVENING_UTC, send });
    expect(summary).toMatchObject({
      hour: 20,
      tomorrow: "2026-05-04",
      attempted: 0,
      sent: 0,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends to subscribers of districts that have collection tomorrow", async () => {
    const kv = makeKv();
    await saveSubscription(kv, makeRecord());
    const send = vi.fn<Sender>(async () => ({ ok: true }));

    const summary = await runDispatch({ kv, now: SUN_EVENING_UTC, send });

    expect(summary).toMatchObject({
      attempted: 1,
      sent: 1,
      expired: 0,
      failed: 0,
    });
    expect(send).toHaveBeenCalledTimes(1);
    const [, payload] = send.mock.calls[0];
    expect(payload).toMatchObject({ url: "/gomi" });
  });

  it("skips districts whose subscribers are bucketed for a different hour", async () => {
    const kv = makeKv();
    await saveSubscription(kv, makeRecord({ hour: 19 }));
    const send = vi.fn<Sender>(async () => ({ ok: true }));

    const summary = await runDispatch({ kv, now: SUN_EVENING_UTC, send });

    expect(summary.attempted).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("cleans up subscriptions reported as expired by the push service", async () => {
    const kv = makeKv();
    const subId = await saveSubscription(kv, makeRecord());
    const send = vi.fn<Sender>(async () => ({
      ok: false,
      expired: true,
      statusCode: 410,
    }));

    const summary = await runDispatch({ kv, now: SUN_EVENING_UTC, send });

    expect(summary).toMatchObject({ attempted: 1, sent: 0, expired: 1 });
    expect(await kv.get(`push:sub:${subId}`)).toBeNull();
    expect(await kv.smembers("push:bucket:toyosu:20")).toEqual([]);
  });

  it("keeps subscriptions on transient failures", async () => {
    const kv = makeKv();
    const subId = await saveSubscription(kv, makeRecord());
    const send = vi.fn<Sender>(async () => ({
      ok: false,
      expired: false,
      statusCode: 500,
    }));

    const summary = await runDispatch({ kv, now: SUN_EVENING_UTC, send });

    expect(summary).toMatchObject({ attempted: 1, sent: 0, failed: 1 });
    expect(await kv.get(`push:sub:${subId}`)).not.toBeNull();
  });
});
