// KV storage for push subscriptions.
//
// Uses @vercel/kv directly rather than going through the KVStore abstraction
// in lib/proxy.ts. That abstraction is for ephemeral/cache values (rate-limit
// counters, weather payloads with TTL); push subscriptions are durable
// records indexed by Set membership, which the abstraction does not model.
//
// KV layout:
//   push:sub:{subId}                 → PushSubscriptionRecord (JSON)
//   push:bucket:{district}:{hour}    → Set<subId>   — cron fan-out lookup
//   push:index                       → Set<subId>   — full membership for sweeps
//
// `subId` is a deterministic hash of the endpoint URL. Re-subscribing the
// same browser is idempotent — it overwrites the existing record and bucket
// membership rather than creating a duplicate.
import { kv as vercelKv } from "@vercel/kv";
import {
  PushSubscriptionRecordSchema,
  type PushSubscriptionRecord,
} from "./types";

// SHA-256 → first 16 hex chars. Web Crypto works in both Edge and Node.
export async function deriveSubId(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 32);
}

function subKey(subId: string): string {
  return `push:sub:${subId}`;
}

function bucketKey(district: string, hour: number): string {
  return `push:bucket:${district}:${hour}`;
}

const INDEX_KEY = "push:index";

// Minimal client surface we depend on. Letting tests pass an in-memory
// double saves us a heavyweight KV mock per case.
export interface PushKv {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<unknown>;
  del(key: string): Promise<unknown>;
  sadd(key: string, ...members: string[]): Promise<number>;
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
}

export function defaultKv(): PushKv {
  return vercelKv as unknown as PushKv;
}

export async function saveSubscription(
  kv: PushKv,
  record: PushSubscriptionRecord,
): Promise<string> {
  const parsed = PushSubscriptionRecordSchema.parse(record);
  const subId = await deriveSubId(parsed.endpoint);
  // Overwrite-or-create: read previous (if any) so we can clean up a stale
  // bucket membership when the user changes district/hour.
  const previous = await kv.get<PushSubscriptionRecord>(subKey(subId));
  await kv.set(subKey(subId), parsed);
  if (
    previous &&
    (previous.district !== parsed.district || previous.hour !== parsed.hour)
  ) {
    await kv.srem(bucketKey(previous.district, previous.hour), subId);
  }
  await kv.sadd(bucketKey(parsed.district, parsed.hour), subId);
  await kv.sadd(INDEX_KEY, subId);
  return subId;
}

export async function getSubscription(
  kv: PushKv,
  subId: string,
): Promise<PushSubscriptionRecord | null> {
  const raw = await kv.get<unknown>(subKey(subId));
  if (raw == null) return null;
  const parsed = PushSubscriptionRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function deleteSubscription(
  kv: PushKv,
  subId: string,
): Promise<boolean> {
  const record = await getSubscription(kv, subId);
  if (record == null) {
    // Still try to clean up the index in case a record was corrupted.
    await kv.srem(INDEX_KEY, subId);
    return false;
  }
  await kv.del(subKey(subId));
  await kv.srem(bucketKey(record.district, record.hour), subId);
  await kv.srem(INDEX_KEY, subId);
  return true;
}

export async function listBucket(
  kv: PushKv,
  district: string,
  hour: number,
): Promise<string[]> {
  return kv.smembers(bucketKey(district, hour));
}
