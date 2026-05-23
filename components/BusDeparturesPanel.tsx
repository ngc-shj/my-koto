"use client";

import { useEffect, useMemo, useState } from "react";
import { KanjiText } from "@/components/Furigana";
import {
  categorizeServiceDay,
  formatBusTime,
  nextDepartures,
  parseBusTimeMinutes,
} from "@/lib/bus/normalize";
import type { ServiceCategory, StopDepartures } from "@/lib/opendata/schemas/bus";

type Props = {
  weekday: readonly string[];
  saturday: readonly string[];
  sunday: readonly string[];
};

const TAB_LABEL: Record<ServiceCategory, string> = {
  weekday: "平日",
  saturday: "土曜",
  sunday: "休日",
};

export default function BusDeparturesPanel({
  weekday,
  saturday,
  sunday,
}: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const todayCategory = useMemo<ServiceCategory | null>(
    () => (now != null ? categorizeServiceDay(now) : null),
    [now],
  );
  const [active, setActive] = useState<ServiceCategory | null>(null);

  useEffect(() => {
    const tick = (): void => setNow(new Date());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (active == null && todayCategory != null) setActive(todayCategory);
  }, [active, todayCategory]);

  const buckets: Record<ServiceCategory, readonly string[]> = {
    weekday,
    saturday,
    sunday,
  };

  const resolvedActive: ServiceCategory =
    active ?? todayCategory ?? "weekday";
  const times = buckets[resolvedActive];

  const upcoming =
    now != null && resolvedActive === todayCategory
      ? nextDepartures(
          { stopId: "current", times } as StopDepartures,
          now,
          3,
        )
      : [];

  return (
    <div>
      <div
        role="tablist"
        aria-label="曜日切り替え"
        className="inline-flex rounded-lg border border-gray-200 overflow-hidden mb-4"
      >
        {(Object.keys(TAB_LABEL) as ServiceCategory[]).map((cat) => {
          const isActive = cat === resolvedActive;
          const isToday = cat === todayCategory;
          return (
            <button
              key={cat}
              role="tab"
              type="button"
              aria-selected={isActive ? "true" : "false"}
              onClick={() => setActive(cat)}
              className={[
                "px-4 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                isActive
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50",
                "border-r border-gray-200 last:border-r-0",
              ].join(" ")}
            >
              <KanjiText text={TAB_LABEL[cat]} />
              {isToday && (
                <span className="ml-1 text-xs" aria-label="本日">
                  ・本日
                </span>
              )}
            </button>
          );
        })}
      </div>

      {upcoming.length > 0 && (
        <section
          aria-live="polite"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4"
        >
          <div className="text-xs text-amber-700 mb-1">
            <KanjiText text="次の発車" />
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((t) => (
              <span
                key={t}
                className="rounded bg-white px-2 py-1 text-sm font-medium text-amber-900 border border-amber-200 tabular-nums"
              >
                {formatBusTime(t)}
              </span>
            ))}
          </div>
        </section>
      )}

      <Timetable times={times} now={now} highlight={resolvedActive === todayCategory} />
    </div>
  );
}

type TimetableProps = {
  times: readonly string[];
  now: Date | null;
  highlight: boolean;
};

function Timetable({ times, now, highlight }: TimetableProps): React.ReactElement {
  if (times.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        <KanjiText text="この曜日の運行はありません。" />
      </p>
    );
  }

  const grouped = new Map<number, string[]>();
  for (const token of times) {
    const minutes = parseBusTimeMinutes(token);
    if (minutes == null) continue;
    const hour = Math.floor(minutes / 60);
    const list = grouped.get(hour) ?? [];
    list.push(token);
    grouped.set(hour, list);
  }

  // Highlight only the single upcoming departure to keep the table scannable.
  const nowMinutes =
    highlight && now != null ? now.getHours() * 60 + now.getMinutes() : -1;
  const nextToken =
    nowMinutes >= 0
      ? times.find((t) => {
          const m = parseBusTimeMinutes(t);
          return m != null && m >= nowMinutes;
        }) ?? null
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
            <span className="flex flex-wrap gap-x-3 gap-y-1 text-gray-700 tabular-nums">
              {list.map((t) => (
                <span
                  key={t}
                  className={
                    t === nextToken
                      ? "rounded bg-amber-100 px-1.5 text-amber-900 font-semibold"
                      : ""
                  }
                >
                  {t.slice(3)}
                </span>
              ))}
            </span>
          </li>
        ))}
    </ol>
  );
}
