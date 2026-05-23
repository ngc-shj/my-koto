"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KanjiText } from "@/components/Furigana";
import { displayRouteName } from "@/lib/bus/aliases";
import { stripChomeSuffix } from "@/lib/bus/normalize";
import { getActiveDistrictId } from "@/lib/profiles";

export type BusStopSearchOption = {
  stopId: string;
  name: string;
  serving: readonly {
    routeId: string;
    shortName: string;
    directionId: "0" | "1";
    headsign: string;
  }[];
};

export type BusRouteSearchOption = {
  routeId: string;
  shortName: string;
  longName: string;
  directions: readonly {
    directionId: "0" | "1";
    headsign: string;
  }[];
};

type Props = {
  stops: readonly BusStopSearchOption[];
  routes: readonly BusRouteSearchOption[];
  // Resolves the active profile's districtId to a Japanese label (e.g. "東陽")
  // so the search box can pre-fill with the user's pinned neighborhood on
  // first paint.
  districtLabelById: Readonly<Record<string, string>>;
};

const MAX_ROUTES = 12;
const MAX_STOPS = 24;

export default function BusFinder({
  stops,
  routes,
  districtLabelById,
}: Props) {
  const [query, setQuery] = useState("");
  const [primed, setPrimed] = useState(false);

  useEffect(() => {
    // localStorage access has to wait for hydration to avoid SSR mismatch.
    const districtId = getActiveDistrictId();
    if (districtId != null) {
      const label = districtLabelById[districtId];
      if (label != null) {
        const seed = stripChomeSuffix(label);
        if (seed.length > 0) setQuery(seed);
      }
    }
    setPrimed(true);
  }, [districtLabelById]);

  const trimmed = query.trim();

  const matchedRoutes = useMemo(() => {
    if (trimmed.length === 0) return [];
    return routes
      .filter(
        (r) =>
          r.shortName.includes(trimmed) ||
          displayRouteName(r.shortName).includes(trimmed) ||
          r.longName.includes(trimmed) ||
          r.directions.some((d) => d.headsign.includes(trimmed)),
      )
      .slice(0, MAX_ROUTES);
  }, [routes, trimmed]);

  const matchedStops = useMemo(() => {
    if (trimmed.length === 0) return [];
    return stops
      .filter((s) => s.name.includes(trimmed))
      .slice(0, MAX_STOPS);
  }, [stops, trimmed]);

  const hasAny = matchedRoutes.length > 0 || matchedStops.length > 0;

  return (
    <div>
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1">
          <KanjiText text="バス停名・系統名で検索" />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: 東陽町駅前 / 業10 / 豊洲"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      {primed && trimmed.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">
          <KanjiText text="バス停名(東陽町駅前など)または系統名(業10など)を入力してください。" />
        </p>
      )}

      {primed && trimmed.length > 0 && !hasAny && (
        <p className="mt-3 text-sm text-gray-500">
          <KanjiText text="該当するバス停または系統が見つかりませんでした。" />
        </p>
      )}

      {matchedRoutes.length > 0 && (
        <section className="mt-4" aria-labelledby="route-results-heading">
          <h2
            id="route-results-heading"
            className="text-xs font-semibold text-slate-500 mb-1"
          >
            <KanjiText text={`系統 (${matchedRoutes.length} 件)`} />
          </h2>
          <ul className="space-y-1">
            {matchedRoutes.map((r) => (
              <li key={r.routeId}>
                <Link
                  href={`/bus/${encodeURIComponent(r.routeId)}`}
                  className="flex items-baseline justify-between gap-2 rounded border border-gray-200 px-3 py-2 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={`${displayRouteName(r.shortName)} 系統の路線図と停留所一覧を開く`}
                >
                  <span className="text-sm">
                    <span className="font-medium text-gray-800 tabular-nums">
                      <KanjiText text={displayRouteName(r.shortName)} />
                    </span>
                    {r.longName.length > 0 && (
                      <span className="text-gray-500 ml-2">
                        <KanjiText text={r.longName} />
                      </span>
                    )}
                  </span>
                  <span className="text-gray-400" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {matchedStops.length > 0 && (
        <section className="mt-6" aria-labelledby="stop-results-heading">
          <h2
            id="stop-results-heading"
            className="text-xs font-semibold text-slate-500 mb-1"
          >
            <KanjiText text={`バス停 (${matchedStops.length} 件)`} />
          </h2>
          <ul className="space-y-3">
            {matchedStops.map((stop) => (
              <li
                key={stop.stopId}
                className="rounded-lg border border-gray-200 p-3"
              >
                <h3 className="font-semibold mb-2 text-gray-800">
                  <KanjiText text={stop.name} />
                </h3>
                <ul className="space-y-1">
                  {stop.serving.map((s) => (
                    <li key={`${s.routeId}-${s.directionId}`}>
                      <Link
                        href={`/bus/${encodeURIComponent(s.routeId)}/${encodeURIComponent(stop.stopId)}?dir=${s.directionId}&from=bus`}
                        className="flex items-baseline justify-between gap-2 rounded px-2 py-1 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        aria-label={`${displayRouteName(s.shortName)} 系統 ${s.headsign} 方面の時刻表を開く`}
                      >
                        <span className="text-sm">
                          <span className="font-medium text-gray-800 tabular-nums">
                            <KanjiText text={displayRouteName(s.shortName)} />
                          </span>
                          <span className="text-gray-500 ml-2">
                            <KanjiText text={`${s.headsign} 方面`} />
                          </span>
                        </span>
                        <span className="text-gray-400" aria-hidden="true">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      {matchedStops.length >= MAX_STOPS && (
        <p className="mt-2 text-xs text-gray-500">
          <KanjiText
            text={`バス停は先頭 ${MAX_STOPS} 件を表示しています。キーワードを絞ってください。`}
          />
        </p>
      )}
    </div>
  );
}
