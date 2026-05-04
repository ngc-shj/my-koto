import type { Metadata } from "next";
import eventsData from "@/data/events.json";
import { EventRecordSchema } from "@/lib/opendata/schemas/events";
import { EventSchema } from "@/lib/events/types";
import type { Event } from "@/lib/events/types";
import Attribution from "@/components/Attribution";
import EventsClient from "./EventsClient";

export const metadata: Metadata = {
  title: "イベントカレンダー | My こうとう (非公式)",
  description: "江東区のイベント情報をカレンダーとリストで確認できます。",
};

// Map EventRecord (API schema) to app-level Event model.
function toEvent(
  record: {
    名称: string;
    開始日: string;
    終了日?: string;
    場所?: string;
    住所?: string;
    説明?: string;
    URL?: string;
    主催?: string;
    備考?: string;
  },
  index: number,
): Event {
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

// Filter events within the next 90 days from today.
function filterUpcoming(events: Event[]): Event[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const limit = new Date(today);
  limit.setDate(limit.getDate() + 90);

  return events.filter((evt) => {
    const start = new Date(evt.startDate);
    const end = evt.endDate ? new Date(evt.endDate) : start;
    // Include if event ends after today and starts before limit.
    return end >= today && start <= limit;
  });
}

export default function EventsPage() {
  // Validate and parse the static JSON data at build time.
  const records = eventsData.result.records.map((r) =>
    EventRecordSchema.parse(r),
  );
  const allEvents: Event[] = records.map((r, i) => toEvent(r, i));
  const upcomingEvents = filterUpcoming(allEvents);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-2">イベントカレンダー</h1>
      <p className="text-sm text-gray-600 mb-6">直近 90 日のイベント情報</p>

      <EventsClient events={upcomingEvents} />

      <div className="mt-8">
        <Attribution dataset="koto-events" />
      </div>
    </main>
  );
}
