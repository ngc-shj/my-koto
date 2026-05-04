import { EventSchema } from "./types";
import type { Event } from "./types";

// Shape produced by `lib/opendata/schemas/events.ts` after Zod parse.
export type EventRecord = {
  名称: string;
  開始日: string;
  終了日?: string;
  場所?: string;
  住所?: string;
  説明?: string;
  URL?: string;
  主催?: string;
  備考?: string;
};

// Single canonical mapper from upstream record shape to the in-app Event
// model. Centralised so the app/events page render and the /api/ics/events
// route can never drift apart on field naming, status mapping, or
// validation (R3 / F-05).
export function toEvent(record: EventRecord, index: number): Event {
  const status: "confirmed" | "cancelled" =
    record.備考 === "中止" ? "cancelled" : "confirmed";
  return EventSchema.parse({
    id: `koto-event-${index + 1}`,
    title: record.名称,
    startDate: record.開始日,
    endDate: record.終了日,
    location: record.場所,
    address: record.住所,
    description: record.説明,
    url: record.URL,
    organizer: record.主催,
    note: record.備考 || undefined,
    status,
  });
}

// Returns events whose interval overlaps the next `windowDays` from `now`.
// Defaults to 90 days to match the plan's "直近 90 日" window.
export function filterUpcoming(
  events: Event[],
  now: Date = new Date(),
  windowDays = 90,
): Event[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + windowDays);
  return events.filter((evt) => {
    const start = new Date(evt.startDate);
    const end = evt.endDate ? new Date(evt.endDate) : start;
    return end >= today && start <= limit;
  });
}
