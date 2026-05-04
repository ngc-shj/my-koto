import { describe, expect, it } from "vitest";
import {
  getLastDispatch,
  saveLastDispatch,
  type StoredDispatchSummary,
} from "./last-dispatch";
import type { PushKv } from "./storage";

function makeKv(): PushKv {
  const values = new Map<string, unknown>();
  const sets = new Map<string, Set<string>>();
  return {
    async get<T>(key: string) {
      return (values.has(key) ? (values.get(key) as T) : null);
    },
    async set<T>(key: string, value: T) {
      values.set(key, value);
      return "OK";
    },
    async del(key: string) {
      values.delete(key);
      return 1;
    },
    async sadd(key: string, ...members: string[]) {
      const set = sets.get(key) ?? new Set<string>();
      let added = 0;
      for (const m of members) {
        if (!set.has(m)) added += 1;
        set.add(m);
      }
      sets.set(key, set);
      return added;
    },
    async srem(key: string, ...members: string[]) {
      const set = sets.get(key);
      if (!set) return 0;
      let removed = 0;
      for (const m of members) {
        if (set.delete(m)) removed += 1;
      }
      return removed;
    },
    async smembers(key: string) {
      return Array.from(sets.get(key) ?? []);
    },
  };
}

function makeSummary(
  overrides: Partial<StoredDispatchSummary> = {},
): StoredDispatchSummary {
  return {
    hour: 20,
    tomorrow: "2026-08-02",
    attempted: 5,
    sent: 5,
    expired: 0,
    failed: 0,
    finishedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("saveLastDispatch / getLastDispatch", () => {
  it("round-trips a summary through KV", async () => {
    const kv = makeKv();
    const summary = makeSummary();
    await saveLastDispatch(kv, summary);
    const out = await getLastDispatch(kv);
    expect(out).toEqual(summary);
  });

  it("returns null when nothing has been written", async () => {
    const kv = makeKv();
    expect(await getLastDispatch(kv)).toBeNull();
  });

  it("returns null when KV holds a malformed value", async () => {
    const kv = makeKv();
    // Write a shape the loose runtime check should reject.
    await kv.set("push:last-dispatch", { hour: "twenty", tomorrow: 0 });
    expect(await getLastDispatch(kv)).toBeNull();
  });

  it("over-writes the previous summary on each save", async () => {
    const kv = makeKv();
    await saveLastDispatch(kv, makeSummary({ sent: 3, finishedAt: 1 }));
    await saveLastDispatch(kv, makeSummary({ sent: 7, finishedAt: 2 }));
    const out = await getLastDispatch(kv);
    expect(out?.sent).toBe(7);
    expect(out?.finishedAt).toBe(2);
  });
});
