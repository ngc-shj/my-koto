"use client";

import { useMemo } from "react";
import { KanjiText } from "@/components/Furigana";
import { formatBusTime, parseBusTimeMinutes } from "@/lib/bus/normalize";

// One scheduled departure. `variantId` lets a controlling parent filter
// the table down to a single terminal (it's the same picker that drives
// the embedded route map, so map + table stay in sync). `headsign` is
// the human label used in the per-time chip when the visible mix has
// more than one terminal.
export type Departure = {
  readonly time: string;
  readonly headsign: string;
  readonly variantId: string;
};

type Props = {
  departures: readonly Departure[];
  // `now` is set by the parent's per-minute tick so the panel can mark
  // the next upcoming departure. `null` while server-rendering.
  now: Date | null;
  // True when `departures` covers the same service category the visitor
  // is currently in — controls whether the "next departure" callout
  // and the inline highlight should fire.
  isToday: boolean;
};

export default function BusDeparturesPanel({
  departures,
  now,
  isToday,
}: Props) {
  // Per-time headsign chip only matters when the visible mix has more
  // than one terminal. When the parent has already filtered to a single
  // variant, every departure shares one headsign so the chip would just
  // repeat — auto-suppress in that case.
  const distinctHeadsigns = useMemo(() => {
    const set = new Set<string>();
    for (const d of departures) {
      if (d.headsign.length > 0) set.add(d.headsign);
    }
    return set;
  }, [departures]);
  const showHeadsignChip = distinctHeadsigns.size > 1;

  const upcoming = useMemo(() => {
    if (!isToday || now == null) return [];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const out: Departure[] = [];
    for (const d of departures) {
      const m = parseBusTimeMinutes(d.time);
      if (m == null) continue;
      if (m >= nowMinutes) {
        out.push(d);
        if (out.length >= 3) break;
      }
    }
    return out;
  }, [departures, isToday, now]);

  return (
    <div>
      {upcoming.length > 0 && (
        <section
          aria-live="polite"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4"
        >
          <div className="text-xs text-amber-700 mb-1">
            <KanjiText text="次の発車" />
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((d, idx) => (
              <span
                key={`${d.time}-${d.variantId}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded bg-white px-2 py-1 text-sm font-medium text-amber-900 border border-amber-200"
              >
                <span className="tabular-nums">{formatBusTime(d.time)}</span>
                {showHeadsignChip && (
                  <span className="text-[10px] text-amber-800 bg-amber-100 px-1 rounded">
                    <KanjiText text={`${d.headsign} 行`} />
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      <Timetable
        departures={departures}
        now={now}
        highlight={isToday}
        showHeadsignChip={showHeadsignChip}
      />
    </div>
  );
}

type TimetableProps = {
  departures: readonly Departure[];
  now: Date | null;
  highlight: boolean;
  showHeadsignChip: boolean;
};

function Timetable({
  departures,
  now,
  highlight,
  showHeadsignChip,
}: TimetableProps): React.ReactElement {
  if (departures.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        <KanjiText text="この曜日の運行はありません。" />
      </p>
    );
  }

  const grouped = new Map<number, Departure[]>();
  for (const d of departures) {
    const minutes = parseBusTimeMinutes(d.time);
    if (minutes == null) continue;
    const hour = Math.floor(minutes / 60);
    const list = grouped.get(hour) ?? [];
    list.push(d);
    grouped.set(hour, list);
  }

  // Highlight only the single upcoming departure to keep the table scannable.
  const nowMinutes =
    highlight && now != null ? now.getHours() * 60 + now.getMinutes() : -1;
  const nextToken =
    nowMinutes >= 0
      ? departures.find((d) => {
          const m = parseBusTimeMinutes(d.time);
          return m != null && m >= nowMinutes;
        })?.time ?? null
      : null;

  return (
    <ol className="border border-gray-200 rounded-lg divide-y divide-gray-100">
      {Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([hour, list]) => (
          <li
            key={hour}
            className="flex items-baseline gap-3 px-3 py-2 text-sm"
          >
            <span className="w-10 shrink-0 font-semibold text-gray-700 tabular-nums">
              {(hour % 24).toString().padStart(2, "0")}
              {hour >= 24 && (
                <span className="ml-1 text-xs text-gray-400">翌</span>
              )}
            </span>
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-gray-700">
              {list.map((d, idx) => (
                <span
                  key={`${d.time}-${d.headsign}-${idx}`}
                  className={
                    d.time === nextToken
                      ? "inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 text-amber-900 font-semibold"
                      : "inline-flex items-center gap-0.5"
                  }
                >
                  <span className="tabular-nums">{d.time.slice(3)}</span>
                  {showHeadsignChip && (
                    <span
                      className="text-[10px] text-slate-600 bg-slate-100 px-1 rounded leading-none"
                      title={`${d.headsign} 行`}
                    >
                      <KanjiText text={d.headsign} />
                    </span>
                  )}
                </span>
              ))}
            </span>
          </li>
        ))}
    </ol>
  );
}
