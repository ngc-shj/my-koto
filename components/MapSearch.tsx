"use client";

import { useMemo, useState } from "react";
import { KanjiText } from "@/components/Furigana";
import { getLayer, isLayerId } from "@/lib/map/registry";
import type { MapPoint } from "@/lib/map/types";

type Props = {
  // Caller passes the same MapPoint catalog rendered on the map. Filter
  // happens client-side because the bundled set is small (~hundreds of
  // rows) and we want zero network on keystroke.
  points: readonly MapPoint[];
  onPick: (point: MapPoint) => void;
};

const MAX_RESULTS = 12;

export function searchMapPoints(
  points: readonly MapPoint[],
  query: string,
  limit = MAX_RESULTS,
): readonly MapPoint[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const out: MapPoint[] = [];
  for (const p of points) {
    if (p.name.includes(trimmed) || p.address.includes(trimmed)) {
      out.push(p);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export default function MapSearch({ points, onPick }: Props) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const filtered = useMemo(
    () => searchMapPoints(points, trimmed),
    [points, trimmed],
  );

  return (
    <div className="space-y-1.5">
      <label className="block">
        <span className="block text-xs font-semibold text-slate-500 mb-1">
          <KanjiText text="場所を検索" />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例: 仙台堀川公園 / 東陽"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>

      {trimmed.length > 0 && filtered.length === 0 && (
        <p className="text-xs text-slate-500">
          <KanjiText text="該当する場所が見つかりませんでした。" />
        </p>
      )}

      {filtered.length > 0 && (
        <ul
          aria-label="検索結果"
          className="max-h-60 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-sm"
        >
          {filtered.map((p) => {
            const layer = isLayerId(p.type) ? getLayer(p.type) : null;
            return (
              <li key={p.id} className="border-b border-slate-100 last:border-b-0">
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setQuery("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 focus:bg-slate-100 focus:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: layer?.color ?? "#64748b" }}
                  >
                    {layer?.letter ?? "?"}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-slate-800 truncate">
                      <KanjiText text={p.name} />
                    </span>
                    {p.address.length > 0 && (
                      <span className="block text-xs text-slate-500 truncate">
                        <KanjiText text={p.address} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
