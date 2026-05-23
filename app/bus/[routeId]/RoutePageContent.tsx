"use client";

import Link from "next/link";
import { useState } from "react";
import { KanjiText } from "@/components/Furigana";
import RouteMapClient, {
  type ActiveDirection,
} from "./RouteMapClient";

type Stop = {
  readonly stopId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
};

type DirectionView = {
  readonly directionId: "0" | "1";
  readonly headsign: string;
  readonly color: string;
  readonly shape: ReadonlyArray<readonly [number, number]>;
  readonly stops: ReadonlyArray<Stop>;
};

type Props = {
  routeId: string;
  routeName: string;
  directions: ReadonlyArray<DirectionView>;
  // From `?dir=` on first load. When present, the matching direction is
  // pre-selected so visitors returning from a stop detail page land
  // already filtered. "all" when absent.
  initialDirection: ActiveDirection;
};

export default function RoutePageContent({
  routeId,
  routeName,
  directions,
  initialDirection,
}: Props) {
  const [active, setActive] = useState<ActiveDirection>(initialDirection);

  const visibleDirections =
    active === "all"
      ? directions
      : directions.filter((d) => d.directionId === active);

  return (
    <>
      <div className="mb-3">
        <RouteMapClient
          routeName={routeName}
          directions={directions}
          activeDirection={active}
        />
      </div>

      {directions.length > 1 && (
        <div
          role="group"
          aria-label="方向で絞り込み"
          className="flex flex-wrap items-center gap-1.5 mb-6 text-xs"
        >
          <button
            type="button"
            onClick={() => setActive("all")}
            // eslint-disable-next-line jsx-a11y/aria-proptypes
            aria-pressed={active === "all" ? "true" : "false"}
            className={`px-3 py-1 rounded-full border ${
              active === "all"
                ? "bg-slate-700 text-white border-transparent"
                : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
            }`}
          >
            両方向
          </button>
          {directions.map((d) => (
            <button
              key={d.directionId}
              type="button"
              onClick={() => setActive(d.directionId)}
              // eslint-disable-next-line jsx-a11y/aria-proptypes
              aria-pressed={active === d.directionId ? "true" : "false"}
              className={`px-3 py-1 rounded-full border inline-flex items-center gap-1.5 ${
                active === d.directionId
                  ? "bg-slate-700 text-white border-transparent"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span
                aria-hidden="true"
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <KanjiText text={`${d.headsign} 方面`} />
            </button>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {visibleDirections.map((dir) => (
          <section
            key={dir.directionId}
            aria-labelledby={`dir-${dir.directionId}`}
          >
            <h2
              id={`dir-${dir.directionId}`}
              className="text-lg font-semibold text-gray-800 mb-3"
            >
              <KanjiText text={`${dir.headsign} 方面`} />
            </h2>
            <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {dir.stops.map((stop, idx) => (
                <li key={`${stop.stopId}-${idx}`}>
                  <Link
                    href={`/bus/${encodeURIComponent(routeId)}/${encodeURIComponent(stop.stopId)}?dir=${dir.directionId}`}
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
              ))}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
