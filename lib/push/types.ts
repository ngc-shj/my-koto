import { z } from "zod";

// Allowed JST hours for the "tomorrow's collection" reminder. Constrained so
// the GH Actions cron only needs to wake up during the evening window.
// Widening this range requires updating `.github/workflows/push-dispatch.yml`.
export const NOTIFY_HOUR_MIN = 18;
export const NOTIFY_HOUR_MAX = 22;

const HourSchema = z.number().int().min(NOTIFY_HOUR_MIN).max(NOTIFY_HOUR_MAX);
const DistrictIdSchema = z.string().regex(/^[a-z0-9-]+$/).max(64);
const EndpointSchema = z.string().url().max(2048);
const KeySchema = z.string().min(1).max(256);

// Push subscription record stored in KV. Only fields we control go here —
// never persist UA strings or IP. The endpoint itself is identifying
// material; treat it as sensitive.
export const PushSubscriptionRecordSchema = z.object({
  endpoint: EndpointSchema,
  p256dh: KeySchema,
  auth: KeySchema,
  district: DistrictIdSchema,
  hour: HourSchema,
  createdAt: z.number().int().positive(),
});

export type PushSubscriptionRecord = z.infer<typeof PushSubscriptionRecordSchema>;

// Body for POST /api/push/subscribe. Mirrors the browser PushSubscription JSON
// shape plus our two preferences.
export const SubscribeBodySchema = z.object({
  subscription: z.object({
    endpoint: EndpointSchema,
    keys: z.object({
      p256dh: KeySchema,
      auth: KeySchema,
    }),
  }),
  district: DistrictIdSchema,
  hour: HourSchema,
});

export type SubscribeBody = z.infer<typeof SubscribeBodySchema>;

export const UnsubscribeBodySchema = z.object({
  endpoint: EndpointSchema,
});

export type UnsubscribeBody = z.infer<typeof UnsubscribeBodySchema>;
