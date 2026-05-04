import eventsData from "@/data/events.json";
import { EventRecordSchema } from "@/lib/opendata/schemas/events";
import { buildEventIcs } from "@/lib/ics";
import type { Event } from "@/lib/events/types";

// Map EventRecord (API schema) to app-level Event model.
function toEvent(record: {
  名称: string;
  開始日: string;
  終了日?: string;
  場所?: string;
  住所?: string;
  説明?: string;
  URL?: string;
  主催?: string;
  備考?: string;
}, index: number): Event {
  const status = record.備考 === "中止" ? "cancelled" as const : "confirmed" as const;
  return {
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
  };
}

export async function GET(): Promise<Response> {
  // Parse and validate static event data at build time.
  const records = eventsData.result.records.map((r) => EventRecordSchema.parse(r));
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
