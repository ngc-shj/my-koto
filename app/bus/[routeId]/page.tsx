import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Attribution from "@/components/Attribution";
import BackToHome from "@/components/BackToHome";
import { KanjiText } from "@/components/Furigana";
import busData from "@/data/bus-toei.json";
import { displayRouteName } from "@/lib/bus/aliases";
import { routeColor } from "@/lib/map/bus-routes";
import { BusToeiDataSchema } from "@/lib/opendata/schemas/bus";
import RoutePageContent from "./RoutePageContent";
import type { ActiveDirection } from "./RouteMapClient";

type Params = { routeId: string };
type Search = { dir?: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

function loadRoute(routeId: string) {
  const data = BusToeiDataSchema.parse(busData);
  const route = data.routes.find((r) => r.routeId === routeId);
  return route != null ? { data, route } : null;
}

function parseInitialDirection(raw: string | undefined): ActiveDirection {
  if (raw === "0" || raw === "1") return raw;
  return "all";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { routeId } = await params;
  const found = loadRoute(decodeURIComponent(routeId));
  if (found == null) return { title: "バス系統 | My こうとう" };
  const name = displayRouteName(found.route.shortName);
  return {
    title: `${name} 系統 | バス時刻表 | My こうとう`,
    description: `都営バス ${name} 系統の停留所一覧と時刻表（江東区を通る系統）`,
  };
}

export async function generateStaticParams(): Promise<Params[]> {
  const data = BusToeiDataSchema.parse(busData);
  return data.routes.map((r) => ({ routeId: encodeURIComponent(r.routeId) }));
}

export default async function RoutePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const { routeId } = await params;
  const { dir } = await searchParams;
  const found = loadRoute(decodeURIComponent(routeId));
  if (found == null) notFound();
  const { data, route } = found;

  // Build the map's per-direction view. `shapes` carries every variant
  // (terminals, detours) so the renderer can draw them all without
  // gaps; `shape` is the legacy singular field used by older bundles.
  const color = routeColor(route.routeId);
  const mapDirections = route.directions.map((d) => {
    const shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
      (d.shapes ?? (d.shape != null ? [d.shape] : [])) as ReadonlyArray<
        ReadonlyArray<readonly [number, number]>
      >;
    return {
      directionId: d.directionId,
      headsign: d.headsign,
      color,
      shapes,
      stops: d.stopSequence
        .map((stopId) => data.stops[stopId])
        .filter((s): s is NonNullable<typeof s> => s != null)
        .map((s) => ({
          stopId: s.stopId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
        })),
    };
  });

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <BackToHome href="/bus" label="バス時刻表へ" />
      <h1 className="text-2xl font-bold mb-2">
        <KanjiText text={`${displayRouteName(route.shortName)} 系統`} />
      </h1>
      {route.longName.length > 0 && (
        <p className="text-sm text-gray-600 mb-4">
          <KanjiText text={route.longName} />
        </p>
      )}

      <RoutePageContent
        routeId={route.routeId}
        routeName={displayRouteName(route.shortName)}
        directions={mapDirections}
        initialDirection={parseInitialDirection(dir)}
      />

      <div className="mt-8 space-y-1">
        <Attribution dataset="toei-bus" />
        <p className="text-xs text-gray-400">
          <a
            href={`${SITE_URL}/bus`}
            className="underline hover:text-gray-600"
          >
            <KanjiText text="系統一覧へ戻る" />
          </a>
        </p>
      </div>
    </main>
  );
}
