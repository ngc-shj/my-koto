import { fetchEventsDataset } from "@/lib/opendata/datasets/events";
import { buildEventIcs } from "@/lib/ics";
import { toEvent, filterUpcoming } from "@/lib/events/normalize";
import type { Event } from "@/lib/events/types";
import { checkRateLimit } from "@/lib/api-shared";

export async function GET(request: Request): Promise<Response> {
  // Rate limit is the same 60 rpm/IP applied to /api/weather. The endpoint
  // is unauthenticated and synthesises ICS server-side per call (S-03).
  const rl = await checkRateLimit(request, {
    bucket: "ics-events",
    limit: 60,
    windowSec: 60,
  });
  if (!rl.ok) {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(rl.retryAfter) },
    });
  }

  // Pull events from the CKAN-backed dataset (lib does the CSV fetch +
  // column mapping + Zod parse) and filter to the same 90-day window the
  // /events page renders so the calendar feed never exposes years of
  // historical records (F-16).
  const dataset = await fetchEventsDataset();
  const events: Event[] = dataset.result.records.map((r, i) => toEvent(r, i));
  const upcoming = filterUpcoming(events);

  const ics = buildEventIcs(upcoming);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="koto-events.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
