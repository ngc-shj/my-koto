// Edge route handler: register a Web Push subscription.
//
// The browser hands us a PushSubscription JSON; we persist endpoint + keys
// + the user's district / hour preference. Re-subscribing the same browser
// is idempotent (storage.ts overwrites and re-buckets).
import type { NextRequest } from "next/server";
import districts from "@/data/districts.json";
import { rateLimitResponse, getAllowedOrigin } from "@/lib/api-shared";
import {
  defaultKv,
  saveSubscription,
  deleteSubscription,
  deriveSubId,
} from "@/lib/push/storage";
import {
  SubscribeBodySchema,
  UnsubscribeBodySchema,
  type PushSubscriptionRecord,
} from "@/lib/push/types";

export const runtime = "edge";

const KNOWN_DISTRICT_IDS = new Set(
  (districts as Array<{ id: string }>).map((d) => d.id),
);

export async function POST(request: NextRequest): Promise<Response> {
  const headers = noStoreHeaders();

  const tooMany = await rateLimitResponse(
    request,
    { bucket: "push-subscribe", limit: 10, windowSec: 60 },
    headers,
  );
  if (tooMany) return tooMany;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON", headers);
  }

  const parsed = SubscribeBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid request body", headers);
  }

  if (!KNOWN_DISTRICT_IDS.has(parsed.data.district)) {
    return jsonError(400, "Unknown district", headers);
  }

  const record: PushSubscriptionRecord = {
    endpoint: parsed.data.subscription.endpoint,
    p256dh: parsed.data.subscription.keys.p256dh,
    auth: parsed.data.subscription.keys.auth,
    district: parsed.data.district,
    hour: parsed.data.hour,
    createdAt: Date.now(),
  };

  try {
    await saveSubscription(defaultKv(), record);
  } catch {
    return jsonError(503, "Storage unavailable", headers);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const headers = noStoreHeaders();

  const tooMany = await rateLimitResponse(
    request,
    { bucket: "push-subscribe", limit: 10, windowSec: 60 },
    headers,
  );
  if (tooMany) return tooMany;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON", headers);
  }

  const parsed = UnsubscribeBodySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "Invalid request body", headers);
  }

  try {
    const subId = await deriveSubId(parsed.data.endpoint);
    await deleteSubscription(defaultKv(), subId);
  } catch {
    return jsonError(503, "Storage unavailable", headers);
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

export async function GET(): Promise<Response> {
  return new Response(null, { status: 405 });
}

function jsonError(status: number, message: string, headers: Headers): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

function noStoreHeaders(): Headers {
  const h = new Headers();
  h.set("Content-Type", "application/json");
  h.set("Cache-Control", "no-store");
  h.set("Access-Control-Allow-Origin", getAllowedOrigin());
  return h;
}
