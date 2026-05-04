// Computes "what should fire right now" for the cron-driven push dispatcher.
// Pure logic only — no KV, no web-push send. The route handler composes this
// with the storage layer.
import { format, addDays } from "date-fns";
import { resolveSchedule } from "@/lib/gomi/schedule";
import {
  GOMI_CATEGORY_LABELS,
  type District,
  type GomiCategory,
  type SpecialOverlay,
} from "@/lib/gomi/types";

// JST is fixed UTC+9; Koto-ku does not observe DST. We never instantiate
// Asia/Tokyo via Intl here because the cron only needs a clock reading.
const JST_OFFSET_HOURS = 9;

export type JstClockReading = {
  // Hour-of-day in JST (0-23) at the moment of `now`.
  hour: number;
  // Tomorrow's calendar date in JST as midnight-local Date. We pass this to
  // the schedule resolver, which interprets it in local TZ.
  tomorrow: Date;
};

export function readJstClock(now: Date): JstClockReading {
  // Shift `now` by +9h, read components in UTC. The result represents the
  // current JST wall-clock; converting to a local-tz Date matches what the
  // schedule resolver expects (it does Date.getDay()/getDate() on the input).
  const shifted = new Date(now.getTime() + JST_OFFSET_HOURS * 60 * 60 * 1000);
  const hour = shifted.getUTCHours();
  const yyyy = shifted.getUTCFullYear();
  const mm = shifted.getUTCMonth();
  const dd = shifted.getUTCDate();
  // Build a local-tz Date for "today JST", then add 1 day. This yields a
  // local-tz midnight that the resolver can compare against weekday/anchor.
  const todayLocal = new Date(yyyy, mm, dd);
  const tomorrow = addDays(todayLocal, 1);
  return { hour, tomorrow };
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  // Tag dedups overlapping notifications — same date+district replaces the
  // previous one rather than stacking on the lockscreen.
  tag: string;
};

// Returns null when there is nothing to notify (no categories tomorrow). The
// caller should skip sending in that case rather than firing an empty push.
export function buildPayload(
  district: District,
  overlays: SpecialOverlay[],
  tomorrow: Date,
): PushPayload | null {
  const occurrences = resolveSchedule(district, overlays, {
    from: tomorrow,
    to: tomorrow,
  });
  if (occurrences.length === 0) return null;
  const categories: GomiCategory[] = occurrences[0].categories;
  if (categories.length === 0) return null;
  const labels = categories.map((c) => GOMI_CATEGORY_LABELS[c]).join("・");
  const dateStr = format(tomorrow, "M月d日");
  return {
    title: `明日 (${dateStr}) のごみ収集`,
    body: `${district.label}: ${labels}`,
    url: "/gomi",
    tag: `gomi-${district.id}-${format(tomorrow, "yyyy-MM-dd")}`,
  };
}
