import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Attribution from "@/components/Attribution";
import BackToHome from "@/components/BackToHome";
import BusDeparturesPanel from "@/components/BusDeparturesPanel";
import { KanjiText } from "@/components/Furigana";
import ShareButton from "@/components/ShareButton";
import busData from "@/data/bus-toei.json";
import { displayRouteName } from "@/lib/bus/aliases";
import {
  BusToeiDataSchema,
  type DirectionPattern,
} from "@/lib/opendata/schemas/bus";

type Params = { routeId: string; stopId: string };
type Search = { dir?: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

function emptyStopDepartures(): { weekday: readonly string[]; saturday: readonly string[]; sunday: readonly string[] } {
  return { weekday: [], saturday: [], sunday: [] };
}

function pickDirection(
  directions: readonly DirectionPattern[],
  stopId: string,
  dirHint?: string,
): DirectionPattern | null {
  const hinted =
    dirHint != null ? directions.find((d) => d.directionId === dirHint) : null;
  if (hinted != null && hinted.stopSequence.includes(stopId)) {
    return hinted;
  }
  return directions.find((d) => d.stopSequence.includes(stopId)) ?? null;
}

function loadStop(routeId: string, stopId: string, dirHint?: string) {
  const data = BusToeiDataSchema.parse(busData);
  const route = data.routes.find((r) => r.routeId === routeId);
  if (route == null) return null;
  const stop = data.stops[stopId];
  if (stop == null) return null;
  const direction = pickDirection(route.directions, stopId, dirHint);
  if (direction == null) return null;

  const find = (
    category: "weekday" | "saturday" | "sunday",
  ): readonly string[] =>
    direction.schedule[category].find((d) => d.stopId === stopId)?.times ?? [];

  return {
    route,
    stop,
    direction,
    timetable: {
      weekday: find("weekday"),
      saturday: find("saturday"),
      sunday: find("sunday"),
    } satisfies ReturnType<typeof emptyStopDepartures>,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { routeId, stopId } = await params;
  const found = loadStop(decodeURIComponent(routeId), decodeURIComponent(stopId));
  if (found == null) return { title: "停留所時刻表 | My こうとう" };
  const routeName = displayRouteName(found.route.shortName);
  return {
    title: `${found.stop.name} ・ ${routeName} | バス時刻表`,
    description: `${routeName} 系統 ${found.direction.headsign} 方面 ${found.stop.name} の時刻表`,
  };
}

export default async function StopPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { routeId, stopId } = await params;
  const { dir } = await searchParams;
  const found = loadStop(
    decodeURIComponent(routeId),
    decodeURIComponent(stopId),
    dir,
  );
  if (found == null) notFound();
  const { route, stop, direction, timetable } = found;

  const shareUrl =
    SITE_URL.length > 0
      ? `${SITE_URL}/bus/${encodeURIComponent(route.routeId)}/${encodeURIComponent(stop.stopId)}?dir=${direction.directionId}`
      : undefined;

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <BackToHome
        href={`/bus/${encodeURIComponent(route.routeId)}`}
        label={`${displayRouteName(route.shortName)} 系統へ戻る`}
      />
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <h1 className="text-2xl font-bold">
            <KanjiText text={stop.name} />
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            <KanjiText
              text={`${displayRouteName(route.shortName)}系統 / ${direction.headsign} 方面`}
            />
          </p>
        </div>
        <ShareButton
          title={`${stop.name} (${displayRouteName(route.shortName)})`}
          url={shareUrl}
        />
      </div>

      <div className="mt-6">
        <BusDeparturesPanel
          weekday={timetable.weekday}
          saturday={timetable.saturday}
          sunday={timetable.sunday}
        />
      </div>

      <div className="mt-4">
        <Link
          href={`/map?layers=bus_stop&focus=${encodeURIComponent(`bus-stop-${stop.stopId}`)}&route=${encodeURIComponent(route.routeId)}&dir=${direction.directionId}`}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          <KanjiText text="地図でこのバス停と路線を見る" />
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {route.directions.length > 1 && (
        <nav aria-label="反対方向" className="mt-6">
          <ul className="flex gap-2 flex-wrap text-sm">
            {route.directions
              .filter((d) => d.directionId !== direction.directionId)
              .map((d) => (
                <li key={d.directionId}>
                  <Link
                    href={`/bus/${encodeURIComponent(route.routeId)}?focus=${d.directionId}`}
                    className="underline text-blue-600 hover:text-blue-800"
                  >
                    <KanjiText text={`${d.headsign} 方面の停留所一覧`} />
                  </Link>
                </li>
              ))}
          </ul>
        </nav>
      )}

      <div className="mt-8">
        <Attribution dataset="toei-bus" />
      </div>
    </main>
  );
}
