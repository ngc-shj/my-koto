// Edge proxy common utilities: KV abstraction, rate limiting, client IP, key helpers.
import { ipAddress } from "@vercel/functions";

// ---------------------------------------------------------------------------
// KVStore interface
// ---------------------------------------------------------------------------

export interface KVStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSec?: number): Promise<void>;
  incr(key: string): Promise<number>;
  expire(key: string, ttlSec: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Vercel KV adapter (production)
// ---------------------------------------------------------------------------

type VercelKVClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
};

export function vercelKvStore(client: VercelKVClient): KVStore {
  return {
    async get<T>(key: string): Promise<T | null> {
      return client.get<T>(key);
    },
    async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
      if (ttlSec != null) {
        await client.set(key, value, { ex: ttlSec });
      } else {
        await client.set(key, value);
      }
    },
    async incr(key: string): Promise<number> {
      return client.incr(key);
    },
    async expire(key: string, ttlSec: number): Promise<void> {
      await client.expire(key, ttlSec);
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory KV store (test / development)
// ---------------------------------------------------------------------------

type InMemoryEntry = {
  value: unknown;
  expiresAt: number | null; // epoch ms, null = no expiry
};

export function inMemoryKvStore(): KVStore {
  const store = new Map<string, InMemoryEntry>();

  function isExpired(entry: InMemoryEntry): boolean {
    if (entry.expiresAt == null) return false;
    return Date.now() >= entry.expiresAt;
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (entry == null || isExpired(entry)) {
        store.delete(key);
        return null;
      }
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
      const expiresAt = ttlSec != null ? Date.now() + ttlSec * 1000 : null;
      store.set(key, { value, expiresAt });
    },
    async incr(key: string): Promise<number> {
      const entry = store.get(key);
      if (entry != null && isExpired(entry)) {
        store.delete(key);
      }
      const current = (store.get(key)?.value as number) ?? 0;
      const next = current + 1;
      store.set(key, {
        value: next,
        expiresAt: store.get(key)?.expiresAt ?? null,
      });
      return next;
    },
    async expire(key: string, ttlSec: number): Promise<void> {
      const entry = store.get(key);
      if (entry != null) {
        store.set(key, { ...entry, expiresAt: Date.now() + ttlSec * 1000 });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// LRU fallback KV store (process-local, for KV failure scenarios)
// ---------------------------------------------------------------------------

type LRUEntry = {
  value: unknown;
  expiresAt: number | null;
};

export function lruFallbackKvStore(maxEntries = 1000): KVStore {
  // Simple LRU using insertion-order Map and eviction on overflow
  const cache = new Map<string, LRUEntry>();

  function evictIfNeeded(): void {
    if (cache.size >= maxEntries) {
      // Delete the oldest entry (first key)
      const firstKey = cache.keys().next().value;
      if (firstKey != null) {
        cache.delete(firstKey);
      }
    }
  }

  function isExpired(entry: LRUEntry): boolean {
    if (entry.expiresAt == null) return false;
    return Date.now() >= entry.expiresAt;
  }

  function touch(key: string, entry: LRUEntry): void {
    // Move to end for LRU recency
    cache.delete(key);
    cache.set(key, entry);
  }

  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = cache.get(key);
      if (entry == null || isExpired(entry)) {
        cache.delete(key);
        return null;
      }
      touch(key, entry);
      return entry.value as T;
    },
    async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
      evictIfNeeded();
      const expiresAt = ttlSec != null ? Date.now() + ttlSec * 1000 : null;
      cache.set(key, { value, expiresAt });
    },
    async incr(key: string): Promise<number> {
      const entry = cache.get(key);
      if (entry != null && isExpired(entry)) {
        cache.delete(key);
      }
      const current = (cache.get(key)?.value as number) ?? 0;
      const next = current + 1;
      evictIfNeeded();
      cache.set(key, {
        value: next,
        expiresAt: cache.get(key)?.expiresAt ?? null,
      });
      return next;
    },
    async expire(key: string, ttlSec: number): Promise<void> {
      const entry = cache.get(key);
      if (entry != null) {
        touch(key, { ...entry, expiresAt: Date.now() + ttlSec * 1000 });
      }
    },
  };
}

// ---------------------------------------------------------------------------
// withFallback: switch to fallback KV on primary failure
// ---------------------------------------------------------------------------

export type NotifyFn = (message: string) => void;

export function withFallback(
  primary: KVStore,
  fallback: KVStore,
  notify?: NotifyFn,
): KVStore {
  async function tryPrimary<T>(
    op: () => Promise<T>,
    fallbackOp: () => Promise<T>,
    label: string,
  ): Promise<T> {
    try {
      return await op();
    } catch (err) {
      const msg = `[proxy] KV primary failure in ${label}: ${err instanceof Error ? err.message : String(err)}. Falling back to LRU.`;
      notify?.(msg);
      return fallbackOp();
    }
  }

  return {
    get<T>(key: string): Promise<T | null> {
      return tryPrimary(
        () => primary.get<T>(key),
        () => fallback.get<T>(key),
        "get",
      );
    },
    set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
      return tryPrimary(
        () => primary.set<T>(key, value, ttlSec),
        () => fallback.set<T>(key, value, ttlSec),
        "set",
      );
    },
    incr(key: string): Promise<number> {
      return tryPrimary(
        () => primary.incr(key),
        () => fallback.incr(key),
        "incr",
      );
    },
    expire(key: string, ttlSec: number): Promise<void> {
      return tryPrimary(
        () => primary.expire(key, ttlSec),
        () => fallback.expire(key, ttlSec),
        "expire",
      );
    },
  };
}

// ---------------------------------------------------------------------------
// getClientIp: trust Vercel's ipAddress(), never trust raw XFF headers
// ---------------------------------------------------------------------------

export function getClientIp(request: Request): string {
  // ipAddress() reads the verified Vercel-appended header, not raw XFF
  const ip = ipAddress(request);
  return ip ?? "0.0.0.0";
}

// ---------------------------------------------------------------------------
// enforceRateLimit: INCR + EXPIRE pure function
// ---------------------------------------------------------------------------

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfter: number };

export async function enforceRateLimit(
  kv: KVStore,
  key: string,
  limit = 60,
  windowSec = 60,
): Promise<RateLimitResult> {
  const count = await kv.incr(key);
  if (count === 1) {
    // First request in this window: set TTL
    await kv.expire(key, windowSec);
  }
  if (count > limit) {
    return { ok: false, retryAfter: windowSec };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// kvKey: schema-versioned key builder
// ---------------------------------------------------------------------------

export function kvKey(
  namespace: string,
  schemaVersion: number,
  ...parts: string[]
): string {
  const joined = parts.join(":");
  return `${namespace}:v${schemaVersion}${joined ? ":" + joined : ""}`;
}

// ---------------------------------------------------------------------------
// parseSchemaVersion: read from env or default to 1
// ---------------------------------------------------------------------------

export function parseSchemaVersion(): number {
  const raw = process.env.KV_SCHEMA_VERSION;
  if (raw == null || raw === "") return 1;
  const n = parseInt(raw, 10);
  return isNaN(n) ? 1 : n;
}
