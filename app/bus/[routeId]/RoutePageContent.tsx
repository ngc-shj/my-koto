"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { KanjiText } from "@/components/Furigana";
import RouteMapClient from "./RouteMapClient";

export type ActiveDirection = "all" | "0" | "1";

type Stop = {
  readonly stopId: string;
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
};

type DayRestriction = "weekday" | "saturday" | "sunday" | null;

type VariantView = {
  readonly variantId: string;
  readonly headsign: string;
  readonly tripCount: number;
  readonly restrictedTo: DayRestriction;
  readonly shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  readonly stops: ReadonlyArray<Stop>;
};

// Picker button color follows the day a variant is locked to so the
// visitor's eye finds Saturday- or Sunday-only routes at a glance.
// Selected state collapses to a strong fill of the same hue; unrelated
// (weekday-only or multi-day) variants stay neutral.
function variantButtonClass(
  restrictedTo: DayRestriction,
  isActive: boolean,
): string {
  if (restrictedTo === "saturday") {
    return isActive
      ? "bg-sky-600 text-white border-transparent"
      : "bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100";
  }
  if (restrictedTo === "sunday") {
    return isActive
      ? "bg-red-600 text-white border-transparent"
      : "bg-red-50 text-red-800 border-red-300 hover:bg-red-100";
  }
  return isActive
    ? "bg-blue-600 text-white border-transparent"
    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50";
}

type DirectionView = {
  readonly directionId: "0" | "1";
  readonly headsign: string;
  readonly color: string;
  readonly shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  readonly stops: ReadonlyArray<Stop>;
  // When undefined or length <= 1, the picker isn't shown — the merged
  // direction view is already faithful enough.
  readonly variants?: ReadonlyArray<VariantView>;
};

type Props = {
  routeId: string;
  routeName: string;
  directions: ReadonlyArray<DirectionView>;
  // From `?dir=` on first load. When present, the matching direction is
  // pre-selected so visitors returning from a stop detail page land
  // already filtered. "all" when absent.
  initialDirection: ActiveDirection;
  // From `?variant=` on first load — paired with initialDirection so
  // a visitor coming back from a stop detail page lands with the same
  // variant they were looking at on the stop page. Ignored when no
  // direction is active (variant is direction-scoped).
  initialVariant?: string;
};

// Sentinel choice for the variant picker. Selecting it falls back to the
// merged direction view (all variants overlaid). Picker hidden when the
// active direction has <= 1 variants.
const ALL_VARIANTS = "all" as const;
type VariantChoice = typeof ALL_VARIANTS | string;

export default function RoutePageContent({
  routeId,
  routeName,
  directions,
  initialDirection,
  initialVariant,
}: Props) {
  const [active, setActive] = useState<ActiveDirection>(initialDirection);
  // Per-direction variant choice persists across direction switches so
  // visitors can compare variants on each direction without losing the
  // other one's pick. Seeded from `?variant=` for the active direction
  // when the caller passed both — that's how the stop detail page hands
  // its picker state back when the visitor taps "戻る".
  const [variantByDir, setVariantByDir] = useState<
    Record<string, VariantChoice>
  >(() => {
    if (
      initialVariant == null ||
      (initialDirection !== "0" && initialDirection !== "1")
    ) {
      return {};
    }
    const dir = directions.find((d) => d.directionId === initialDirection);
    if (
      dir?.variants == null ||
      !dir.variants.some((v) => v.variantId === initialVariant)
    ) {
      return {};
    }
    return { [initialDirection]: initialVariant };
  });
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

  // Resolve a direction to its currently-active view. If the visitor
  // selected a specific variant, fold that variant's stops/shapes/
  // headsign back into the DirectionView shape so downstream rendering
  // can stay variant-agnostic.
  const applyVariant = (d: DirectionView): DirectionView => {
    const choice = variantByDir[d.directionId] ?? ALL_VARIANTS;
    if (
      choice === ALL_VARIANTS ||
      d.variants == null ||
      d.variants.length === 0
    ) {
      return d;
    }
    const v = d.variants.find((x) => x.variantId === choice);
    if (v == null) return d;
    return {
      ...d,
      headsign: v.headsign,
      shapes: v.shapes,
      stops: v.stops,
    };
  };

  const visibleDirections = useMemo(() => {
    const filtered =
      active === "all"
        ? directions
        : directions.filter((d) => d.directionId === active);
    return filtered.map(applyVariant);
    // applyVariant depends on variantByDir; including the function in
    // deps would cause unnecessary churn since its identity changes
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, directions, variantByDir]);

  // Variant picker is only shown when one specific direction is active
  // and that direction has more than one variant. Two-direction view
  // ("両方向") hides it to avoid asking the visitor to think about four
  // dimensions at once.
  const variantPickerDirection =
    active !== "all"
      ? directions.find(
          (d) =>
            d.directionId === active &&
            d.variants != null &&
            d.variants.length > 1,
        )
      : undefined;
  const variantPickerVariants = variantPickerDirection?.variants ?? [];
  const variantPickerChoice =
    (variantPickerDirection != null
      ? variantByDir[variantPickerDirection.directionId]
      : undefined) ?? ALL_VARIANTS;

  return (
    <>
      <div
        ref={mapWrapperRef}
        className="sticky top-0 -mx-4 px-4 pt-2 pb-2 bg-white z-10 mb-3 scroll-mt-4 border-b border-slate-100 space-y-2"
      >
        <RouteMapClient
          routeName={routeName}
          directions={visibleDirections}
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
        {variantPickerDirection != null && (
          <div
            role="group"
            aria-label="経路で絞り込み"
            className="flex flex-wrap items-center gap-1.5 text-xs"
          >
            <span className="text-slate-500 mr-1">
              <KanjiText text="経路:" />
            </span>
            <button
              type="button"
              onClick={() =>
                setVariantByDir((prev) => ({
                  ...prev,
                  [variantPickerDirection.directionId]: ALL_VARIANTS,
                }))
              }
              // eslint-disable-next-line jsx-a11y/aria-proptypes
              aria-pressed={
                variantPickerChoice === ALL_VARIANTS ? "true" : "false"
              }
              aria-label="すべての経路を表示"
              className={`px-3 py-1 rounded-full border ${
                variantPickerChoice === ALL_VARIANTS
                  ? "bg-blue-600 text-white border-transparent"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <KanjiText text="すべて" />
            </button>
            {variantPickerVariants.map((v) => (
              <button
                key={v.variantId}
                type="button"
                onClick={() =>
                  setVariantByDir((prev) => ({
                    ...prev,
                    [variantPickerDirection.directionId]: v.variantId,
                  }))
                }
                // eslint-disable-next-line jsx-a11y/aria-proptypes
                aria-pressed={
                  variantPickerChoice === v.variantId ? "true" : "false"
                }
                aria-label={`${v.headsign} 行 経路 (${v.tripCount} 便) で絞り込む`}
                className={`px-3 py-1 rounded-full border ${variantButtonClass(
                  v.restrictedTo,
                  variantPickerChoice === v.variantId,
                )}`}
              >
                <KanjiText text={`${v.headsign} 行`} />
                <span className="ml-1 text-[10px] opacity-75 tabular-nums">
                  ({v.tripCount})
                </span>
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
                // Propagate the active variant choice so the stop detail
                // page's picker lands pre-filtered to the same경로 the
                // visitor was looking at on this route page.
                const activeVariantForDir =
                  variantByDir[dir.directionId] ?? ALL_VARIANTS;
                const timetableHref =
                  activeVariantForDir === ALL_VARIANTS
                    ? `/bus/${encodeURIComponent(routeId)}/${encodeURIComponent(stop.stopId)}?dir=${dir.directionId}`
                    : `/bus/${encodeURIComponent(routeId)}/${encodeURIComponent(stop.stopId)}?dir=${dir.directionId}&variant=${encodeURIComponent(activeVariantForDir)}`;
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
                      href={timetableHref}
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
