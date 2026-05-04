import type { Metadata } from "next";
import eventsData from "@/data/events.json";
import { EventRecordSchema } from "@/lib/opendata/schemas/events";
import { toEvent, filterUpcoming } from "@/lib/events/normalize";
import type { Event } from "@/lib/events/types";
import Attribution from "@/components/Attribution";
import BackToHome from "@/components/BackToHome";
import ShareButton from "@/components/ShareButton";
import EventsClient from "./EventsClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

export const metadata: Metadata = {
  title: "イベントカレンダー | My こうとう (非公式)",
  description: "江東区のイベント情報をカレンダーとリストで確認できます。",
};

export default function EventsPage() {
  // Validate and parse the static JSON data at build time.
  const records = eventsData.result.records.map((r) =>
    EventRecordSchema.parse(r),
  );
  const allEvents: Event[] = records.map((r, i) => toEvent(r, i));
  const upcomingEvents = filterUpcoming(allEvents);

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <BackToHome />
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold">イベントカレンダー</h1>
        <ShareButton title="イベントカレンダー" url={`${SITE_URL}/events`} />
      </div>
      <p className="text-sm text-gray-600 mb-6">直近 90 日のイベント情報</p>

      <EventsClient events={upcomingEvents} />

      <div className="mt-8">
        <Attribution dataset="koto-events" />
      </div>
    </main>
  );
}
