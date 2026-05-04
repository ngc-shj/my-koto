// Thin wrapper around `web-push` so the dispatch route can mock the send
// in tests. Lives in its own file (Node-only) so importing it from any Edge
// route at runtime would be a build-time error rather than a 500 in prod.
import webpush from "web-push";
import type { PushSubscriptionRecord } from "./types";

export type SendResult =
  | { ok: true }
  | { ok: false; expired: boolean; statusCode: number | null };

export type Sender = (
  record: PushSubscriptionRecord,
  payload: unknown,
) => Promise<SendResult>;

let configured = false;

function configureOnce(): void {
  if (configured) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error("VAPID env vars not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

// Real sender — requires VAPID env vars at first call. Returns a structured
// result so the caller can decide whether to clean up the subscription
// (expired = 404/410 from the push service) without throwing through the
// happy path.
export async function sendPush(
  record: PushSubscriptionRecord,
  payload: unknown,
): Promise<SendResult> {
  configureOnce();
  try {
    await webpush.sendNotification(
      {
        endpoint: record.endpoint,
        keys: { p256dh: record.p256dh, auth: record.auth },
      },
      JSON.stringify(payload),
      // TTL: drop the message if the device is offline for more than 6 hours.
      // The "tomorrow's gomi" reminder loses value past that window anyway.
      { TTL: 6 * 60 * 60 },
    );
    return { ok: true };
  } catch (err) {
    const statusCode =
      err instanceof Error && "statusCode" in err
        ? Number((err as { statusCode: unknown }).statusCode) || null
        : null;
    const expired = statusCode === 404 || statusCode === 410;
    return { ok: false, expired, statusCode };
  }
}
