import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BusDeparturesPanel from "@/components/BusDeparturesPanel";
import { KanjiText } from "@/components/Furigana";
import PageFooter from "@/components/PageFooter";
import PageHeader from "@/components/PageHeader";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readBus } from "@/lib/opendata/db/readers";
import { displayRouteName } from "@/lib/bus/aliases";
import { routeColor } from "@/lib/map/bus-routes";
import type { DirectionPattern } from "@/lib/opendata/schemas/bus";
import RouteMapClient from "../RouteMapClient";

type Params = { routeId: string; stopId: string };
type Search = { dir?: string; from?: string };

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

async function loadStop(routeId: string, stopId: string, dirHint?: string) {
  const data = await readBus(openDatasetsDb());
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
    data,
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
  const found = await loadStop(
    decodeURIComponent(routeId),
    decodeURIComponent(stopId),
  );
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
  const { dir, from } = await searchParams;
  const cameFromMap = from === "map";
  const cameFromBus = from === "bus";
  const found = await loadStop(
    decodeURIComponent(routeId),
    decodeURIComponent(stopId),
    dir,
  );
  if (found == null) notFound();
  const { data, route, stop, direction, timetable } = found;

  // Build the map view — only the visited direction, with the current
  // stop highlighted so the visitor sees where they are on the line.
  const color = routeColor(route.routeId);
  const shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
    (direction.shapes ??
      (direction.shape != null
        ? [direction.shape]
        : [])) as ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  const mapDirections = [
    {
      directionId: direction.directionId,
      headsign: direction.headsign,
      color,
      shapes,
      stops: direction.stopSequence
        .map((sid) => data.stops[sid])
        .filter((s): s is NonNullable<typeof s> => s != null)
        .map((s) => ({
          stopId: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
        })),
    },
  ];

  const shareUrl =
    SITE_URL.length > 0
      ? `${SITE_URL}/bus/${encodeURIComponent(route.routeId)}/${encodeURIComponent(stop.stopId)}?dir=${direction.directionId}`
      : undefined;

  // Back-link selection follows the entry flow so "戻る" never asks the
  // visitor to leap further back than where they actually were.
  const back = cameFromBus
    ? { href: "/bus", label: "バス時刻表へ戻る" }
    : cameFromMap
      ? {
          href: `/map?focus=${encodeURIComponent(`bus-stop-${stop.stopId}`)}`,
          label: "区民マップへ戻る",
        }
      : {
          href: `/bus/${encodeURIComponent(route.routeId)}?dir=${direction.directionId}&from=stop&stopId=${encodeURIComponent(stop.stopId)}`,
          label: `${displayRouteName(route.shortName)} 系統へ戻る`,
        };
  return (
    <>
      <PageHeader
        back={back}
        title={stop.name}
        subtitle={
          <Link
            href={`/bus/${encodeURIComponent(route.routeId)}?dir=${direction.directionId}`}
            aria-label={`${displayRouteName(route.shortName)} 系統 ${direction.headsign} 方面の停留所一覧を開く`}
            className="text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <KanjiText
              text={`${displayRouteName(route.shortName)}系統 / ${direction.headsign} 方面`}
            />
          </Link>
        }
        share={{
          title: `${stop.name} (${displayRouteName(route.shortName)})`,
          url: shareUrl,
        }}
      />
      <main className="max-w-2xl mx-auto px-4 py-6">
        <div>
          <RouteMapClient
            routeName={displayRouteName(route.shortName)}
            directions={mapDirections}
            highlightStopId={stop.stopId}
          />
        </div>

        <div className="mt-6">
          <BusDeparturesPanel
            weekday={timetable.weekday}
            saturday={timetable.saturday}
            sunday={timetable.sunday}
          />
        </div>

        {route.directions.length > 1 && (
          <nav aria-label="反対方向" className="mt-6">
            <ul className="flex gap-2 flex-wrap text-sm">
              {route.directions
                .filter((d) => d.directionId !== direction.directionId)
                .map((d) => (
                  <li key={d.directionId}>
                    <Link
                      href={`/bus/${encodeURIComponent(route.routeId)}?dir=${d.directionId}`}
                      className="underline text-blue-600 hover:text-blue-800"
                    >
                      <KanjiText text={`${d.headsign} 方面の停留所一覧`} />
                    </Link>
                  </li>
                ))}
            </ul>
          </nav>
        )}

        <PageFooter dataset="toei-bus" />
      </main>
    </>
  );
}
