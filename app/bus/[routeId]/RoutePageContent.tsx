"use client";

import Link from "next/link";
import { useRef, useState } from "react";
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
  readonly shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
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
  // Tapping the per-stop "地図" button paints that stop in red on the
  // embedded map (matching the /bus/[routeId]/[stopId] visualization)
  // and scrolls the map into view so on mobile the visitor sees the
  // change without having to scroll up.
  const [highlightStopId, setHighlightStopId] = useState<string | null>(null);
  const mapWrapperRef = useRef<HTMLDivElement>(null);

  const handleHighlight = (stopId: string) => {
    setHighlightStopId((prev) => (prev === stopId ? null : stopId));
    mapWrapperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visibleDirections =
    active === "all"
      ? directions
      : directions.filter((d) => d.directionId === active);

  return (
    <>
      <div
        ref={mapWrapperRef}
        className="sticky top-0 -mx-4 px-4 pt-2 pb-2 bg-white z-10 mb-3 scroll-mt-4 border-b border-slate-100 space-y-2"
      >
        <RouteMapClient
          routeName={routeName}
          directions={directions}
          activeDirection={active}
          highlightStopId={highlightStopId ?? undefined}
        />
        {directions.length > 1 && (
          <div
            role="group"
            aria-label="方向で絞り込み"
            className="flex flex-wrap items-center gap-1.5 text-xs"
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
      </div>

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
              {dir.stops.map((stop, idx) => {
                const isHighlighted = highlightStopId === stop.stopId;
                return (
                  <li
                    key={`${stop.stopId}-${idx}`}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span className="text-sm flex-1 min-w-0">
                      <span className="text-gray-400 mr-2 tabular-nums">
                        {(idx + 1).toString().padStart(2, "0")}
                      </span>
                      <KanjiText text={stop.name} />
                      {active === "all" && (
                        <span
                          className="ml-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 align-middle"
                          aria-label={`${dir.headsign} 方面`}
                        >
                          <KanjiText text={`${dir.headsign} 方面`} />
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleHighlight(stop.stopId)}
                      // eslint-disable-next-line jsx-a11y/aria-proptypes
                      aria-pressed={isHighlighted ? "true" : "false"}
                      aria-label={
                        isHighlighted
                          ? `${stop.name} の地図ハイライトを解除`
                          : `${stop.name} を地図でハイライト`
                      }
                      className={`text-xs px-2 py-1 rounded border whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isHighlighted
                          ? "bg-red-600 text-white border-transparent"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      <KanjiText text="地図" />
                    </button>
                    <Link
                      href={`/map?focus=${encodeURIComponent(`bus-stop-${stop.stopId}`)}`}
                      aria-label={`${stop.name} の場所を区民マップで開く`}
                      className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap"
                    >
                      <KanjiText text="区民マップ" />
                    </Link>
                    <Link
                      href={`/bus/${encodeURIComponent(routeId)}/${encodeURIComponent(stop.stopId)}?dir=${dir.directionId}`}
                      aria-label={`${stop.name} の時刻表を開く`}
                      className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 whitespace-nowrap"
                    >
                      <KanjiText text="時刻表" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </>
  );
}
