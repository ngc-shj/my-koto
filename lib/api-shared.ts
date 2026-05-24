// Shared rate-limit pipeline used by every public Edge route. Centralised
// here so adding a new endpoint cannot accidentally ship without limits
// (RS2 / S-02 / S-03 root cause).
import { kv as vercelKv } from "@vercel/kv";
import {
  vercelKvStore,
  lruFallbackKvStore,
  withFallback,
  getClientIp,
  enforceRateLimit,
  kvKey,
  parseSchemaVersion,
} from "@/lib/proxy";

// Process-local fallback KV. One per worker; OK because each Edge instance
// applies its own bucket — distribution looseness is acceptable for the
// degraded-mode safety net.
const lruStore = lruFallbackKvStore(2000);

// Per-worker dedupe window for the Discord webhook. Without this, a sustained
// KV outage would emit one webhook POST per request (N-01). The cooldown
// is process-local so each Edge instance still announces itself once when
// it transitions into degraded mode.
const NOTIFY_DEDUPE_MS = 5 * 60 * 1000;
let lastNotifyAt = 0;

function notify(_msg: string): void {
  const webhookUrl = process.env.DISCORD_WEBHOOK;
  if (!webhookUrl) return;
  const now = Date.now();
  if (now - lastNotifyAt < NOTIFY_DEDUPE_MS) return;
  lastNotifyAt = now;
  // Send a fixed message — never forward the raw err.message string,
  // which @vercel/kv could populate with parts of the connection URL
  // when the upstream connection itself fails (S-04).
  void fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: "[my-koto] primary KV failure, fell back to LRU",
    }),
  }).catch(() => {});
}

export function buildKv() {
  return withFallback(vercelKvStore(vercelKv), lruStore, notify);
}

export type RateLimitConfig = {
  // Logical bucket name — appears in the KV key namespace. Choose a name
  // unique per route so traffic to one endpoint cannot starve another.
  bucket: string;
  // Max requests per window per IP.
  limit: number;
  // Window length in seconds.
  windowSec: number;
};

export type RateLimitDecision =
  | { ok: true }
  | { ok: false; retryAfter: number };

// Single entry point for the rate limit decision. Returns ok=true on
// success, or ok=false plus a Retry-After hint that callers should send
// back in the 429 response.
export async function checkRateLimit(
  request: Request,
  cfg: RateLimitConfig,
): Promise<RateLimitDecision> {
  const kv = buildKv();
  const ip = getClientIp(request);
  const schemaVersion = parseSchemaVersion();
  const key = kvKey("rl", schemaVersion, cfg.bucket, ip);
  return enforceRateLimit(kv, key, cfg.limit, cfg.windowSec);
}

// Convenience: returns a 429 Response when the limit is exceeded, or null
// when the request may proceed. Callers fall through to their happy path
// when the result is null. This keeps the rate-limit wiring identical
// across routes so future endpoints inherit the policy by reflex.
export async function rateLimitResponse(
  request: Request,
  cfg: RateLimitConfig,
  baseHeaders: Headers,
): Promise<Response | null> {
  const result = await checkRateLimit(request, cfg);
  if (result.ok) return null;
  // C1.1: 429 must never advertise positive freshness — clone base headers
  // and override Cache-Control to no-store, dropping any SWR/SIE directives.
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "no-store");
  headers.set("Retry-After", String(result.retryAfter));
  return new Response(JSON.stringify({ error: "Too Many Requests" }), {
    status: 429,
    headers,
  });
}

export type CacheDirective = Readonly<{
  maxAge: number;            // browser cache (seconds, integer >= 0)
  sMaxAge: number;           // shared/CDN cache (seconds, integer >= 0)
  staleWhileRevalidate: number; // SWR window (seconds, integer >= 0)
  staleIfError: number;      // SIE window (seconds, integer >= 0)
}>;

export function jsonResponseHeaders(
  allowOrigin: string,
  cache?: CacheDirective,
): Headers {
  const h = new Headers();
  if (cache) {
    const maxAgeToken =
      cache.maxAge === 0 ? "no-cache" : `max-age=${cache.maxAge}`;
    h.set(
      "Cache-Control",
      `public, ${maxAgeToken}, s-maxage=${cache.sMaxAge}, stale-while-revalidate=${cache.staleWhileRevalidate}, stale-if-error=${cache.staleIfError}`,
    );
  } else {
    h.set("Cache-Control", "public, s-maxage=3600, stale-if-error=86400");
  }
  h.set("Vary", "Accept-Encoding");
  h.set("Access-Control-Allow-Origin", allowOrigin);
  h.set("Content-Type", "application/json");
  return h;
}

export function getAllowedOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
