import eventsData from "@/data/events.json";
import { EventRecordSchema } from "@/lib/opendata/schemas/events";
import { buildEventIcs } from "@/lib/ics";
import { toEvent } from "@/lib/events/normalize";
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

  // Parse and validate static event data at build time.
  const records = eventsData.result.records.map((r) =>
    EventRecordSchema.parse(r),
  );
  const events: Event[] = records.map((r, i) => toEvent(r, i));

  const ics = buildEventIcs(events);

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="koto-events.ics"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
