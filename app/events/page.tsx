import type { Metadata } from "next";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readEvents } from "@/lib/opendata/db/readers";
import { toEvent } from "@/lib/events/normalize";
import type { Event } from "@/lib/events/types";
import { KanjiText } from "@/components/Furigana";
import PageFooter from "@/components/PageFooter";
import PageHeader from "@/components/PageHeader";
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
    <>
      <PageHeader
        back={{ href: "/", label: "ホームへ戻る" }}
        title="イベントカレンダー"
        subtitle={<KanjiText text="直近 90 日のイベント情報" />}
        share={{ title: "イベントカレンダー", url: `${SITE_URL}/events` }}
        maxWidth="4xl"
      />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <EventsClient events={upcomingEvents} />

        <PageFooter dataset="koto-events" />
      </main>
    </>
  );
}
