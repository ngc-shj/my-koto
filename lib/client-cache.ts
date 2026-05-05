import type { ZodType } from "zod";

export type CachedFetchOptions = Readonly<{
  ttlMs: number;
  signal?: AbortSignal;
  now?: () => number; // injectable for tests; defaults to Date.now
}>;

type CacheEntry<T> = {
  storedAt: number;
  data: T;
};

const STORAGE_PREFIX = "kc:cache:v1:";

export async function cachedFetchJson<T>(
  cacheKey: string,
  url: string,
  schema: ZodType<T>,
  opts: CachedFetchOptions,
): Promise<T> {
  const now = opts.now ?? Date.now;
  const storageKey = `${STORAGE_PREFIX}${cacheKey}`;

  // SSR safety: skip all sessionStorage access on the server.
  if (typeof window !== "undefined") {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw !== null) {
        const entry = JSON.parse(raw) as CacheEntry<unknown>;
        if (now() - entry.storedAt < opts.ttlMs) {
          // Validate cached value before returning — a schema mismatch means
          // a stale/corrupt entry; fall through to network fetch.
          const parsed = schema.safeParse(entry.data);
          if (parsed.success) {
            return parsed.data;
          }
        }
      }
    } catch {
      // Corrupt JSON or sessionStorage unavailable — proceed to network.
    }
  }

  const response = await fetch(url, { signal: opts.signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json: unknown = await response.json();
  const parsed = schema.parse(json);

  // Write to sessionStorage if in a browser context.
  // Abort-path: if signal was aborted, fetch() would have thrown above,
  // so we never reach this point on abort — no cache poisoning possible.
  if (typeof window !== "undefined") {
    const entry: CacheEntry<T> = { storedAt: now(), data: parsed };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(entry));
    } catch {
      // QuotaExceededError or private-mode restriction — non-fatal.
    }
  }

  return parsed;
}
