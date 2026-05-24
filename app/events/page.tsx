import type { Metadata } from "next";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readEvents } from "@/lib/opendata/db/readers";
import { toEvent } from "@/lib/events/normalize";
import type { Event } from "@/lib/events/types";
import Attribution from "@/components/Attribution";
import BackToHome from "@/components/BackToHome";
import { KanjiText } from "@/components/Furigana";
import ShareButton from "@/components/ShareButton";
import EventsClient from "./EventsClient";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

// ISR: regenerate the page hourly so the list never goes more than an
// hour stale without re-fetching the CKAN CSV on every visit.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "イベントカレンダー | My こうとう (非公式)",
  description: "江東区のイベント情報をカレンダーとリストで確認できます。",
};

export default async function EventsPage() {
  // Read events from the local libsql snapshot. `ensure-data` populates
  // it via Conditional fetch against CKAN — this page never touches the
  // upstream itself, so per-ISR revalidations cost zero upstream load.
  // Pass `upcomingFrom` so the SQL layer narrows the result to the 90-day
  // window the page renders.
  const dataset = await readEvents(openDatasetsDb(), {
    upcomingFrom: new Date(),
  });
  const upcomingEvents: Event[] = dataset.result.records.map((r, i) =>
    toEvent(r, i),
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <BackToHome />
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-2xl font-bold">
          <KanjiText text="イベントカレンダー" />
        </h1>
        <ShareButton title="イベントカレンダー" url={`${SITE_URL}/events`} />
      </div>
      <p className="text-sm text-gray-600 mb-6">
        <KanjiText text="直近 90 日のイベント情報" />
      </p>

      <EventsClient events={upcomingEvents} />

      <div className="mt-8">
        <Attribution dataset="koto-events" />
      </div>
    </main>
  );
}
