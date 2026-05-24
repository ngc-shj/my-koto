"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import BusDeparturesPanel, {
  type Departure,
} from "@/components/BusDeparturesPanel";
import { KanjiText } from "@/components/Furigana";
import PageHeader from "@/components/PageHeader";
import { categorizeServiceDay } from "@/lib/bus/normalize";
import type { ServiceCategory } from "@/lib/opendata/schemas/bus";
import RouteMapClient from "../RouteMapClient";

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

type DirectionView = {
  readonly directionId: "0" | "1";
  readonly headsign: string;
  readonly color: string;
  readonly shapes: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
  readonly stops: ReadonlyArray<Stop>;
  readonly variants?: ReadonlyArray<VariantView>;
};

type Timetable = {
  readonly weekday: readonly Departure[];
  readonly saturday: readonly Departure[];
  readonly sunday: readonly Departure[];
};

type BackInfo = {
  readonly hrefBase: string;
  readonly label: string;
  readonly takesVariant: boolean;
};

type SubtitleInfo = {
  readonly hrefBase: string;
  readonly routeName: string;
  readonly headsign: string;
};

type ShareInfo = {
  readonly title: string;
  readonly url?: string;
};

type Props = {
  routeName: string;
  stopName: string;
  stopId: string;
  direction: DirectionView;
  timetable: Timetable;
  back: BackInfo;
  subtitle: SubtitleInfo;
  share: ShareInfo;
  initialVariant?: string;
};

const ALL_VARIANTS = "all" as const;
type VariantChoice = typeof ALL_VARIANTS | string;

const DAY_LABEL: Record<ServiceCategory, string> = {
  weekday: "平日",
  saturday: "土曜",
  sunday: "休日",
};

// Active-tab color mirrors the day-restricted variant colors so the
// visitor sees the same hue whether they're filtering by day or by
// route. 平日 stays neutral (no cultural color), 土曜 picks up sky,
// 休日 picks up red.
const DAY_ACTIVE_CLASS: Record<ServiceCategory, string> = {
  weekday: "bg-slate-700 text-white",
  saturday: "bg-sky-600 text-white",
  sunday: "bg-red-600 text-white",
};

// Picker button color follows the day a variant is locked to so the
// visitor's eye finds Saturday- or Sunday-only routes at a glance.
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

// One state, two views. The pickers control both the embedded map's
// polylines/pins and the departures table, so the visitor never sees
// a map line for trips that aren't in their timetable filter. Both
// pickers sit above the map so the visitor has every filter visible
// at a glance.
export default function StopDetailClient({
  routeName,
  stopName,
  stopId,
  direction,
  timetable,
  back,
  subtitle,
  share,
  initialVariant,
}: Props) {
  const variantsAtStop = useMemo(
    () => direction.variants ?? [],
    [direction.variants],
  );
  const showVariantPicker = variantsAtStop.length > 1;

  const initialChoice: VariantChoice =
    initialVariant != null &&
    variantsAtStop.some((v) => v.variantId === initialVariant)
      ? initialVariant
      : ALL_VARIANTS;
  const [variantChoice, setVariantChoice] =
    useState<VariantChoice>(initialChoice);

  // Live clock for "next departure" highlighting + day-tab "本日" tag.
  // Ticks every 30 s — finer would cost re-renders without changing
  // the displayed minutes.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = (): void => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const todayCategory = useMemo<ServiceCategory | null>(
    () => (now != null ? categorizeServiceDay(now) : null),
    [now],
  );
  const [activeCategory, setActiveCategory] =
    useState<ServiceCategory | null>(null);
  useEffect(() => {
    if (activeCategory == null && todayCategory != null) {
      setActiveCategory(todayCategory);
    }
  }, [activeCategory, todayCategory]);
  const resolvedCategory: ServiceCategory =
    activeCategory ?? todayCategory ?? "weekday";

  const variantSuffix =
    variantChoice === ALL_VARIANTS
      ? ""
      : `&variant=${encodeURIComponent(variantChoice)}`;
  const backHref = back.takesVariant
    ? `${back.hrefBase}${variantSuffix}`
    : back.hrefBase;
  const subtitleHref = `${subtitle.hrefBase}${variantSuffix}`;

  const effectiveDirection = useMemo<DirectionView>(() => {
    if (variantChoice === ALL_VARIANTS) return direction;
    const v = variantsAtStop.find((x) => x.variantId === variantChoice);
    if (v == null) return direction;
    return {
      ...direction,
      headsign: v.headsign,
      shapes: v.shapes,
      stops: v.stops,
    };
  }, [direction, variantChoice, variantsAtStop]);

  const departuresForView = useMemo<readonly Departure[]>(() => {
    const raw = timetable[resolvedCategory];
    if (variantChoice === ALL_VARIANTS) return raw;
    return raw.filter((d) => d.variantId === variantChoice);
  }, [timetable, resolvedCategory, variantChoice]);

  // Per-variant per-day availability — derived from the timetable so a
  // weekday-only variant grays out on the 土曜/休日 tabs even when it's
  // listed in `variantsAtStop`. Used both to disable buttons and to
  // auto-revert when the active variant becomes unavailable.
  const variantDeparturesByDay = useMemo(() => {
    const map = new Map<string, Record<ServiceCategory, boolean>>();
    for (const v of variantsAtStop) {
      map.set(v.variantId, {
        weekday: false,
        saturday: false,
        sunday: false,
      });
    }
    (["weekday", "saturday", "sunday"] as const).forEach((cat) => {
      for (const d of timetable[cat]) {
        const entry = map.get(d.variantId);
        if (entry) entry[cat] = true;
      }
    });
    return map;
  }, [variantsAtStop, timetable]);

  const isVariantAvailable = useCallback(
    (variantId: string) =>
      variantDeparturesByDay.get(variantId)?.[resolvedCategory] ?? false,
    [variantDeparturesByDay, resolvedCategory],
  );

  // When the day picker moves the visitor onto a day the currently
  // selected variant doesn't run, fall back to "all" so they always
  // see something useful (an empty table with a disabled-looking
  // active button would just confuse).
  useEffect(() => {
    if (
      variantChoice !== ALL_VARIANTS &&
      !isVariantAvailable(variantChoice)
    ) {
      setVariantChoice(ALL_VARIANTS);
    }
  }, [variantChoice, isVariantAvailable]);

  return (
    <>
      <PageHeader
        back={{ href: backHref, label: back.label }}
        title={stopName}
        subtitle={
          <Link
            href={subtitleHref}
            aria-label={`${subtitle.routeName} 系統 ${subtitle.headsign} 方面の停留所一覧を開く`}
            className="text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <KanjiText
              text={`${subtitle.routeName}系統 / ${subtitle.headsign} 方面`}
            />
          </Link>
        }
        share={share}
      />
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Filter zone: day + variant pickers above the map so visitors
            see every control at a glance. Day picker comes first because
            曜日 is the primary axis people think about first. */}
        <div
          role="tablist"
          aria-label="曜日切り替え"
          className="inline-flex rounded-lg border border-gray-200 overflow-hidden text-sm mb-2"
        >
          {(Object.keys(DAY_LABEL) as ServiceCategory[]).map((cat) => {
            const isActive = cat === resolvedCategory;
            const isToday = cat === todayCategory;
            return (
              <button
                key={cat}
                role="tab"
                type="button"
                aria-selected={isActive ? "true" : "false"}
                onClick={() => setActiveCategory(cat)}
                className={[
                  "px-4 py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                  isActive
                    ? DAY_ACTIVE_CLASS[cat]
                    : "bg-white text-gray-700 hover:bg-gray-50",
                  "border-r border-gray-200 last:border-r-0",
                ].join(" ")}
              >
                <KanjiText text={DAY_LABEL[cat]} />
                {isToday && (
                  <span className="ml-1 text-xs" aria-label="本日">
                    ・本日
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {showVariantPicker && (
          <div
            role="group"
            aria-label="経路で絞り込み"
            className="flex flex-wrap items-center gap-1.5 text-xs mb-3"
          >
            <span className="text-slate-500 mr-1">
              <KanjiText text="経路:" />
            </span>
            <button
              type="button"
              onClick={() => setVariantChoice(ALL_VARIANTS)}
              // eslint-disable-next-line jsx-a11y/aria-proptypes
              aria-pressed={variantChoice === ALL_VARIANTS ? "true" : "false"}
              aria-label="すべての経路を表示"
              className={`px-3 py-1 rounded-full border ${
                variantChoice === ALL_VARIANTS
                  ? "bg-blue-600 text-white border-transparent"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              <KanjiText text="すべて" />
            </button>
            {variantsAtStop.map((v) => {
              const available = isVariantAvailable(v.variantId);
              const dayLabel = DAY_LABEL[resolvedCategory];
              return (
                <button
                  key={v.variantId}
                  type="button"
                  disabled={!available}
                  onClick={() => setVariantChoice(v.variantId)}
                  // eslint-disable-next-line jsx-a11y/aria-proptypes
                  aria-pressed={
                    variantChoice === v.variantId ? "true" : "false"
                  }
                  aria-label={
                    available
                      ? `${v.headsign} 行 経路 (${v.tripCount} 便) で絞り込む`
                      : `${v.headsign} 行 経路は ${dayLabel} 運行なし`
                  }
                  title={
                    available
                      ? undefined
                      : `${dayLabel}は運行ありません`
                  }
                  className={`px-3 py-1 rounded-full border ${variantButtonClass(
                    v.restrictedTo,
                    variantChoice === v.variantId,
                  )} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white`}
                >
                  <KanjiText text={`${v.headsign} 行`} />
                  <span className="ml-1 text-[10px] opacity-75 tabular-nums">
                    ({v.tripCount})
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2">
          <RouteMapClient
            routeName={routeName}
            directions={[effectiveDirection]}
            highlightStopId={stopId}
          />
        </div>

        <div className="mt-6">
          <BusDeparturesPanel
            departures={departuresForView}
            now={now}
            isToday={resolvedCategory === todayCategory}
          />
        </div>
      </div>
    </>
  );
}
