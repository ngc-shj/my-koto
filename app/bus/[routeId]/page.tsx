import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { KanjiText } from "@/components/Furigana";
import PageFooter from "@/components/PageFooter";
import PageHeader from "@/components/PageHeader";
import { openDatasetsDb } from "@/lib/opendata/db/client";
import { readBus } from "@/lib/opendata/db/readers";
import { displayRouteName } from "@/lib/bus/aliases";
import {
  disambiguatedHeadsign,
  variantRestriction,
} from "@/lib/bus/variants";
import { routeColor } from "@/lib/map/bus-routes";
import RoutePageContent, { type ActiveDirection } from "./RoutePageContent";

type Params = { routeId: string };
type Search = {
  dir?: string;
  from?: string;
  stopId?: string;
  variant?: string;
};

async function loadRoute(routeId: string) {
  const data = await readBus(openDatasetsDb());
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
  const found = await loadRoute(decodeURIComponent(routeId));
  if (found == null) return { title: "バス系統 | My こうとう" };
  const name = displayRouteName(found.route.shortName);
  return {
    title: `${name} 系統 | バス時刻表 | My こうとう`,
    description: `都営バス ${name} 系統の停留所一覧と時刻表（江東区を通る系統）`,
  };
}

export async function generateStaticParams(): Promise<Params[]> {
  const data = await readBus(openDatasetsDb());
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
  const { dir, from, stopId, variant } = await searchParams;
  const found = await loadRoute(decodeURIComponent(routeId));
  if (found == null) notFound();
  const { data, route } = found;

  // Back-link selection follows the entry flow so "戻る" never asks the
  // visitor to leap further back than where they actually were. From a
  // stop detail page (?from=stop&stopId=…) the link returns to that
  // stop; otherwise the default points one level up to the bus search.
  const stopReturn =
    from === "stop" && stopId != null
      ? data.stops[decodeURIComponent(stopId)] ?? null
      : null;
  const stopReturnDir = dir === "0" || dir === "1" ? dir : "0";
  const backHref =
    stopReturn != null
      ? `/bus/${encodeURIComponent(route.routeId)}/${encodeURIComponent(stopReturn.stopId)}?dir=${stopReturnDir}`
      : "/bus";
  const backLabel =
    stopReturn != null
      ? `${stopReturn.name} 停留所へ戻る`
      : "バス時刻表へ戻る";

  // Build the map's per-direction view. `shapes` carries every variant
  // (terminals, detours) so the renderer can draw them all without
  // gaps; `shape` is the legacy singular field used by older bundles.
  // `variants`, when present on the dataset, is forwarded so the
  // RoutePageContent picker can drill the merged direction view down
  // to one concrete stop pattern at a time.
  const color = routeColor(route.routeId);
  const resolveStops = (sequence: readonly string[]) =>
    sequence
      .map((stopId) => data.stops[stopId])
      .filter((s): s is NonNullable<typeof s> => s != null)
      .map((s) => ({
        stopId: s.stopId,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
      }));
  const mapDirections = route.directions.map((d) => {
    const shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>> =
      (d.shapes ?? (d.shape != null ? [d.shape] : [])) as ReadonlyArray<
        ReadonlyArray<readonly [number, number]>
      >;
    const allVariants = d.variants ?? [];
    const variants = d.variants?.map((v) => ({
      variantId: v.variantId,
      // Display label that's unique within this direction — same helper
      // as the stop detail page, so picker tabs and chip labels stay
      // consistent end-to-end.
      headsign: disambiguatedHeadsign(v, allVariants),
      tripCount: v.tripCount,
      // Flags variants that only run on a single service category so
      // the picker can paint Saturday-only / Sunday-only buttons in a
      // distinct color (visitors picking on the wrong day immediately
      // see the mismatch).
      restrictedTo: variantRestriction(v),
      shapes: (v.shapes ?? []) as ReadonlyArray<
        ReadonlyArray<readonly [number, number]>
      >,
      stops: resolveStops(v.stopSequence),
    }));
    return {
      directionId: d.directionId,
      headsign: d.headsign,
      color,
      shapes,
      stops: resolveStops(d.stopSequence),
      variants,
    };
  });

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: backLabel }}
        title={`${displayRouteName(route.shortName)} 系統`}
        subtitle={
          route.longName.length > 0 ? (
            <KanjiText text={route.longName} />
          ) : undefined
        }
        maxWidth="4xl"
      />
      <main className="max-w-4xl mx-auto px-4 py-6">
        <RoutePageContent
          routeId={route.routeId}
          routeName={displayRouteName(route.shortName)}
          directions={mapDirections}
          initialDirection={parseInitialDirection(dir)}
          initialVariant={variant}
        />

        <PageFooter dataset="toei-bus">
          <p className="text-xs text-gray-400">
            <Link href="/bus" className="underline hover:text-gray-600">
              <KanjiText text="バス時刻表へ戻る" />
            </Link>
          </p>
        </PageFooter>
      </main>
    </>
  );
}
