"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, isAfter, isSameDay } from "date-fns";
import { ja } from "date-fns/locale";
import {
  GOMI_CATEGORY_LABELS,
  type District,
  type SpecialOverlay,
} from "@/lib/gomi/types";
import { resolveSchedule } from "@/lib/gomi/schedule";
import type { Event } from "@/lib/events/types";
import { getActiveProfile, type Profile } from "@/lib/profiles";
import type { WeatherResponse } from "@/lib/opendata/schemas/weather";

type Props = {
  districts: District[];
  overlays: SpecialOverlay[];
  upcomingEvents: Event[];
};

type WeatherState =
  | { status: "loading" }
  | { status: "success"; data: WeatherResponse }
  | { status: "error" };

const CATEGORY_DOT: Record<string, string> = {
  burnable: "bg-red-500",
  non_burnable: "bg-blue-500",
  resource_plastic: "bg-green-500",
  container_plastic: "bg-teal-500",
  pet_bottle: "bg-yellow-500",
  bottles_cans: "bg-purple-500",
  bulky: "bg-gray-500",
};

export default function TodaySummary({
  districts,
  overlays,
  upcomingEvents,
}: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weather, setWeather] = useState<WeatherState>({ status: "loading" });
  // `today` lives in state so the SSR-rendered placeholder uses the same
  // anchor as subsequent re-renders. Initialised once on mount.
  const [today, setToday] = useState<Date | null>(null);

  useEffect(() => {
    setProfile(getActiveProfile());
    setToday(new Date());
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/weather", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WeatherResponse;
        setWeather({ status: "success", data });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setWeather({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  const district = useMemo<District | null>(() => {
    if (!profile) return null;
    return districts.find((d) => d.id === profile.districtId) ?? null;
  }, [profile, districts]);

  const gomiTodayTomorrow = useMemo(() => {
    if (!district || !today) return null;
    const tomorrow = addDays(today, 1);
    const occurrences = resolveSchedule(district, overlays, {
      from: today,
      to: tomorrow,
    });
    const todays = occurrences.find((o) => isSameDay(o.date, today));
    const tomorrows = occurrences.find((o) => isSameDay(o.date, tomorrow));
    return { today: todays, tomorrow: tomorrows };
  }, [district, overlays, today]);

  const nextEvents = useMemo<Event[]>(() => {
    if (!today) return [];
    return upcomingEvents
      .filter((evt) => {
        const end = new Date(evt.endDate ?? evt.startDate);
        return !isAfter(today, end);
      })
      .slice(0, 2);
  }, [upcomingEvents, today]);

  if (today === null) {
    // SSR / first paint placeholder — keeps the layout stable while we
    // wait for the localStorage read to resolve.
    return (
      <div className="rounded-xl border border-gray-200 p-4 text-sm text-gray-500">
        Today サマリを読み込み中…
      </div>
    );
  }

  if (!profile || !district) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
        <h2 className="text-base font-semibold text-blue-900">
          地区プロファイルを設定してください
        </h2>
        <p className="text-sm text-blue-800">
          ごみ収集や通知の対象となる地区を一度だけ登録すると、トップページに今日の予定が表示されます。
        </p>
        <a
          href="/settings"
          className="inline-block px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
        >
          設定画面へ
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
      <header className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">現在のプロファイル</p>
          <p className="text-base font-semibold text-gray-900 truncate">
            {profile.name}
            <span className="ml-2 text-sm text-gray-500 font-normal">
              {district.label}
            </span>
          </p>
        </div>
        <a
          href="/settings"
          className="text-xs text-blue-600 underline hover:text-blue-800 flex-shrink-0"
        >
          切替
        </a>
      </header>

      <GomiSection occurrence={gomiTodayTomorrow?.today ?? null} label="今日" />
      <GomiSection
        occurrence={gomiTodayTomorrow?.tomorrow ?? null}
        label="明日"
      />

      <WeatherSection state={weather} />

      <EventsSection events={nextEvents} today={today} />
    </div>
  );
}

function GomiSection({
  occurrence,
  label,
}: {
  occurrence: { date: Date; categories: string[] } | null;
  label: string;
}) {
  return (
    <section className="px-4 py-3 flex items-start gap-3">
      <span className="text-xs font-medium text-gray-500 w-12 flex-shrink-0 mt-0.5">
        {label}のごみ
      </span>
      <div className="flex-1 min-w-0">
        {occurrence == null ? (
          <p className="text-sm text-gray-400">収集なし</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {occurrence.categories.map((cat) => (
              <li
                key={cat}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block w-1.5 h-1.5 rounded-full ${
                    CATEGORY_DOT[cat] ?? "bg-gray-400"
                  }`}
                />
                {GOMI_CATEGORY_LABELS[cat as keyof typeof GOMI_CATEGORY_LABELS] ??
                  cat}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function WeatherSection({ state }: { state: WeatherState }) {
  return (
    <section className="px-4 py-3 flex items-start gap-3">
      <span className="text-xs font-medium text-gray-500 w-12 flex-shrink-0 mt-0.5">
        天気
      </span>
      <div className="flex-1 min-w-0">
        {state.status === "loading" && (
          <p className="text-sm text-gray-400">読み込み中…</p>
        )}
        {state.status === "error" && (
          <p className="text-sm text-amber-700">取得に失敗しました</p>
        )}
        {state.status === "success" && state.data.daily ? (
          <ul className="space-y-0.5 text-sm text-gray-700">
            {state.data.daily.time.slice(0, 2).map((date, i) => {
              const daily = state.data.daily!;
              const min = daily.temperature_2m_min[i];
              const max = daily.temperature_2m_max[i];
              const precip = daily.precipitation_probability_max?.[i];
              const labelDate = i === 0 ? "今日" : "明日";
              return (
                <li key={date} className="flex flex-wrap items-baseline gap-2">
                  <span className="text-xs text-gray-500 w-10 flex-shrink-0">
                    {labelDate}
                  </span>
                  <span>
                    {min != null && max != null ? `${min}°〜${max}°C` : "—"}
                  </span>
                  {precip != null && (
                    <span className="text-xs text-blue-600">降水 {precip}%</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function EventsSection({ events, today }: { events: Event[]; today: Date }) {
  if (events.length === 0) {
    return (
      <section className="px-4 py-3 flex items-start gap-3">
        <span className="text-xs font-medium text-gray-500 w-12 flex-shrink-0 mt-0.5">
          イベント
        </span>
        <p className="text-sm text-gray-400">直近の区主催イベントはありません</p>
      </section>
    );
  }
  return (
    <section className="px-4 py-3 flex items-start gap-3">
      <span className="text-xs font-medium text-gray-500 w-12 flex-shrink-0 mt-0.5">
        イベント
      </span>
      <ul className="flex-1 min-w-0 space-y-1">
        {events.map((evt) => {
          const start = new Date(evt.startDate);
          const isToday = isSameDay(start, today);
          const isCancelled = evt.status === "cancelled";
          return (
            <li key={evt.id} className="text-sm">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span
                  className={`text-xs ${
                    isToday ? "font-semibold text-emerald-700" : "text-gray-500"
                  }`}
                >
                  {format(start, "M月d日(E)", { locale: ja })}
                </span>
                <span
                  className={`flex-1 min-w-0 truncate ${
                    isCancelled
                      ? "text-gray-400 line-through"
                      : "text-gray-800"
                  }`}
                >
                  {evt.title}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
