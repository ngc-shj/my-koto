import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Attribution from "@/components/Attribution";
import BackToHome from "@/components/BackToHome";
import { KanjiText } from "@/components/Furigana";
import busData from "@/data/bus-toei.json";
import { displayRouteName } from "@/lib/bus/aliases";
import { BusToeiDataSchema } from "@/lib/opendata/schemas/bus";

type Params = { routeId: string };

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

function loadRoute(routeId: string) {
  const data = BusToeiDataSchema.parse(busData);
  const route = data.routes.find((r) => r.routeId === routeId);
  return route != null ? { data, route } : null;
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
}: {
  params: Promise<Params>;
}) {
  const { routeId } = await params;
  const found = loadRoute(decodeURIComponent(routeId));
  if (found == null) notFound();
  const { data, route } = found;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <BackToHome href="/bus" label="バス系統一覧へ" />
      <h1 className="text-2xl font-bold mb-2">
        <KanjiText text={`${displayRouteName(route.shortName)} 系統`} />
      </h1>
      {route.longName.length > 0 && (
        <p className="text-sm text-gray-600 mb-6">
          <KanjiText text={route.longName} />
        </p>
      )}

      <div className="space-y-8">
        {route.directions.map((dir) => (
          <section key={dir.directionId} aria-labelledby={`dir-${dir.directionId}`}>
            <h2
              id={`dir-${dir.directionId}`}
              className="text-lg font-semibold text-gray-800 mb-3"
            >
              <KanjiText text={`${dir.headsign} 方面`} />
            </h2>
            <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {dir.stopSequence.map((stopId, idx) => {
                const stop = data.stops[stopId];
                if (stop == null) return null;
                return (
                  <li key={`${stopId}-${idx}`}>
                    <Link
                      href={`/bus/${encodeURIComponent(route.routeId)}/${encodeURIComponent(stopId)}?dir=${dir.directionId}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={`${stop.name} の時刻表を開く`}
                    >
                      <span className="text-sm">
                        <span className="text-gray-400 mr-2 tabular-nums">
                          {(idx + 1).toString().padStart(2, "0")}
                        </span>
                        <KanjiText text={stop.name} />
                      </span>
                      <span className="text-gray-400" aria-hidden="true">
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

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
