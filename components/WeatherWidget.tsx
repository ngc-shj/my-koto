"use client";

import { useEffect, useState } from "react";
import DataFreshness from "@/components/DataFreshness";
import { KanjiText } from "@/components/Furigana";
import { formatDayWithWeekday } from "@/lib/i18n/datetime";
import { WeatherResponseSchema } from "@/lib/opendata/schemas/weather";
import type { WeatherResponse } from "@/lib/opendata/schemas/weather";
import { cachedFetchJson } from "@/lib/client-cache";
import { withBasePath } from "@/lib/site/base-path";
import { WEATHER_CACHE } from "@/config/cache";

// Open-Meteo daily timestamps are bare "YYYY-MM-DD" — assemble a JST Date
// so the unified formatter renders the right local weekday.
function formatDailyDate(iso: string): string {
  return formatDayWithWeekday(new Date(`${iso}T00:00:00+09:00`));
}

type State =
  | { status: "loading" }
  | { status: "success"; data: WeatherResponse; fetchedAt: Date }
  | { status: "error" };

export default function WeatherWidget() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void cachedFetchJson<WeatherResponse>(
      "weather:v1",
      withBasePath("/api/weather"),
      WeatherResponseSchema,
      { ttlMs: WEATHER_CACHE.CLIENT_TTL_MS, signal: controller.signal },
    )
      .then((data) => {
        setState({ status: "success", data, fetchedAt: new Date() });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setState({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  if (state.status === "loading") {
    return (
      <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
        <KanjiText text="天気情報を読み込み中…" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        <KanjiText text="天気情報を取得できませんでした。" />
      </div>
    );
  }

  const { data, fetchedAt } = state;
  const daily = data.daily;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <h2 className="text-base font-semibold text-blue-800 mb-2">
        <KanjiText text="天気（江東区中心）" />
      </h2>
      {daily ? (
        <ul className="space-y-1 text-sm text-gray-700">
          {daily.time.slice(0, 2).map((date, i) => (
            <li key={date} className="flex gap-3 flex-wrap">
              <span className="font-medium whitespace-nowrap shrink-0">
                {formatDailyDate(date)}
              </span>
              <span className="whitespace-nowrap">
                {daily.temperature_2m_max[i] != null &&
                daily.temperature_2m_min[i] != null
                  ? `${daily.temperature_2m_min[i]}°C〜${daily.temperature_2m_max[i]}°C`
                  : "—"}
              </span>
              {daily.precipitation_probability_max?.[i] != null && (
                <span className="text-blue-600 whitespace-nowrap">
                  <KanjiText text="降水" /> {daily.precipitation_probability_max[i]}%
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">
          <KanjiText text="予報データなし" />
        </p>
      )}
      <div className="mt-2">
        <DataFreshness lastModified={fetchedAt} label="取得日時" />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        出典:{" "}
        <a
          href="https://open-meteo.com"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open-Meteo
        </a>{" "}
        (CC-BY 4.0)
      </p>
    </div>
  );
}
