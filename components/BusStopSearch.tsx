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

type Props = {
  stops: readonly BusStopSearchOption[];
  // Resolves the active profile's districtId to a Japanese label (e.g. "東陽")
  // so the search box can pre-fill with the user's pinned neighborhood on
  // first paint.
  districtLabelById: Readonly<Record<string, string>>;
};

const MAX_RESULTS = 30;

export default function BusStopSearch({ stops, districtLabelById }: Props) {
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
  const filtered = useMemo(() => {
    if (trimmed.length === 0) return [];
    return stops
      .filter((s) => s.name.includes(trimmed))
      .slice(0, MAX_RESULTS);
  }, [stops, trimmed]);

  return (
    <div>
      <label className="block">
        <span className="block text-sm font-medium text-gray-700 mb-1">
          <KanjiText text="バス停名で検索" />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: 東陽町駅前"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      {primed && trimmed.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">
          <KanjiText text="バス停名を入力すると、そのバス停を通る系統が表示されます。" />
        </p>
      )}

      {primed && trimmed.length > 0 && filtered.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">
          <KanjiText text="該当するバス停が見つかりませんでした。" />
        </p>
      )}

      {filtered.length > 0 && (
        <ul className="mt-4 space-y-3" aria-label="検索結果">
          {filtered.map((stop) => (
            <li
              key={stop.stopId}
              className="rounded-lg border border-gray-200 p-3"
            >
              <h2 className="font-semibold mb-2 text-gray-800">
                <KanjiText text={stop.name} />
              </h2>
              <ul className="space-y-1">
                {stop.serving.map((s) => (
                  <li key={`${s.routeId}-${s.directionId}`}>
                    <Link
                      href={`/bus/${encodeURIComponent(s.routeId)}/${encodeURIComponent(stop.stopId)}?dir=${s.directionId}`}
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
      )}

      {filtered.length >= MAX_RESULTS && (
        <p className="mt-2 text-xs text-gray-500">
          <KanjiText
            text={`先頭 ${MAX_RESULTS} 件を表示しています。検索キーワードを絞ってください。`}
          />
        </p>
      )}
    </div>
  );
}
