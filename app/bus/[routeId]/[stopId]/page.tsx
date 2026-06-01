import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { type Departure } from "@/components/BusDeparturesPanel";
import { KanjiText } from "@/components/Furigana";
import PageFooter from "@/components/PageFooter";
import { parseBusTimeMinutes } from "@/lib/bus/normalize";
import {
  disambiguatedHeadsign,
  variantRestriction,
} from "@/lib/bus/variants";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readBus } from "@/lib/opendata/db/readers";
import { displayRouteName } from "@/lib/bus/aliases";
import { routeColor } from "@/lib/map/bus-routes";
import type {
  DirectionPattern,
  ServiceCategory,
} from "@/lib/opendata/schemas/bus";
import StopDetailClient from "./StopDetailClient";

type Params = { routeId: string; stopId: string };
type Search = { dir?: string; from?: string; variant?: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

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

// Build the timetable as Departure entries tagged with each trip's
// terminal. For routes with variants we iterate per-variant so two
// trips departing at the same time but going to different terminals
// stay distinguishable; for routes with no variants we fall back to
// the merged schedule tagged with the (single) direction headsign.
function buildDeparturesAtStop(
  category: ServiceCategory,
  direction: DirectionPattern,
  stopId: string,
): Departure[] {
  if (direction.variants != null && direction.variants.length > 0) {
    const allVariants = direction.variants;
    const out: Departure[] = [];
    for (const v of allVariants) {
      const times =
        v.schedule[category].find((d) => d.stopId === stopId)?.times ?? [];
      const label = disambiguatedHeadsign(v, allVariants);
      for (const t of times) {
        out.push({ time: t, headsign: label, variantId: v.variantId });
      }
    }
    out.sort((a, b) => {
      const am = parseBusTimeMinutes(a.time);
      const bm = parseBusTimeMinutes(b.time);
      if (am == null || bm == null) return 0;
      return am - bm;
    });
    return out;
  }
  const times =
    direction.schedule[category].find((d) => d.stopId === stopId)?.times ?? [];
  return times.map((t) => ({
    time: t,
    headsign: direction.headsign,
    variantId: "",
  }));
}

// Deduplicate readBus calls within a single render cycle
const getCachedBusData = cache(() => readBus(openDatasetsDb()));

async function loadStop(routeId: string, stopId: string, dirHint?: string) {
  const data = await getCachedBusData();
  const route = data.routes.find((r) => r.routeId === routeId);
  if (route == null) return null;
  const stop = data.stops[stopId];
  if (stop == null) return null;
  const direction = pickDirection(route.directions, stopId, dirHint);
  if (direction == null) return null;

  return {
    data,
    route,
    stop,
    direction,
    timetable: {
      weekday: buildDeparturesAtStop("weekday", direction, stopId),
      saturday: buildDeparturesAtStop("saturday", direction, stopId),
      sunday: buildDeparturesAtStop("sunday", direction, stopId),
    },
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
  const { dir, from, variant } = await searchParams;
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
  // Each variant carries its own stops/shapes so StopDetailClient's
  // picker can swap the rendered geometry without going back to the
  // server.
  const color = routeColor(route.routeId);
  const resolveStops = (sequence: readonly string[]) =>
    sequence
      .map((sid) => data.stops[sid])
      .filter((s): s is NonNullable<typeof s> => s != null)
      .map((s) => ({
        stopId: s.stopId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
      }));
  const shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
    (direction.shapes ??
      (direction.shape != null
        ? [direction.shape]
        : [])) as ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  // Variants restricted to those that actually serve this stop — a
  // picker entry for a variant that skips this stop would give the
  // visitor nothing useful, and selecting it would hide the highlight
  // pin entirely.
  const allDirectionVariants = direction.variants ?? [];
  const directionVariants = allDirectionVariants
    .filter((v) => v.stopSequence.includes(stop.stopId))
    .map((v) => ({
      variantId: v.variantId,
      // Disambiguate against ALL variants in the direction (not just
      // those serving this stop) so the same variant reads identically
      // wherever it appears in the app.
      headsign: disambiguatedHeadsign(v, allDirectionVariants),
      tripCount: v.tripCount,
      // Saturday-only / Sunday-only flag so the picker can paint the
      // button in a day-themed color.
      restrictedTo: variantRestriction(v),
      shapes: (v.shapes ?? []) as ReadonlyArray<
        ReadonlyArray<readonly [number, number]>
      >,
      stops: resolveStops(v.stopSequence),
    }));
  const mapDirection = {
    directionId: direction.directionId,
    headsign: direction.headsign,
    color,
    shapes,
    stops: resolveStops(direction.stopSequence),
    variants:
      directionVariants.length > 0 ? directionVariants : undefined,
  };

  const shareUrl =
    SITE_URL.length > 0
      ? `${SITE_URL}/bus/${encodeURIComponent(route.routeId)}/${encodeURIComponent(stop.stopId)}?dir=${direction.directionId}`
      : undefined;

  // Back-link selection follows the entry flow so "戻る" never asks the
  // visitor to leap further back than where they actually were. Only
  // the back-to-route case carries the current variant choice forward
  // — /bus and /map don't understand the param so we leave their hrefs
  // alone.
  const back = cameFromBus
    ? { hrefBase: "/bus", label: "バス時刻表へ戻る", takesVariant: false }
    : cameFromMap
      ? {
          hrefBase: `/map?focus=${encodeURIComponent(`bus-stop-${stop.stopId}`)}`,
          label: "区民マップへ戻る",
          takesVariant: false,
        }
      : {
          hrefBase: `/bus/${encodeURIComponent(route.routeId)}?dir=${direction.directionId}&from=stop&stopId=${encodeURIComponent(stop.stopId)}`,
          label: `${displayRouteName(route.shortName)} 系統へ戻る`,
          takesVariant: true,
        };
  return (
    <>
      <StopDetailClient
        routeName={displayRouteName(route.shortName)}
        stopName={stop.name}
        stopId={stop.stopId}
        direction={mapDirection}
        timetable={timetable}
        back={back}
        subtitle={{
          hrefBase: `/bus/${encodeURIComponent(route.routeId)}?dir=${direction.directionId}`,
          routeName: displayRouteName(route.shortName),
          headsign: direction.headsign,
        }}
        share={{
          title: `${stop.name} (${displayRouteName(route.shortName)})`,
          url: shareUrl,
        }}
        initialVariant={variant}
      />
      <main className="max-w-2xl mx-auto px-4 py-6">
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
