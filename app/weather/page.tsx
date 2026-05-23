"use client";

import { useEffect, useState } from "react";
import BackToHome from "@/components/BackToHome";
import DataFreshness from "@/components/DataFreshness";
import { KanjiText } from "@/components/Furigana";
import ShareButton from "@/components/ShareButton";
import JmaQuakePanel from "@/components/JmaQuakePanel";
import JmaWarningPanel from "@/components/JmaWarningPanel";
import WbgtPanel from "@/components/WbgtPanel";
import { formatDayWithWeekday } from "@/lib/i18n/datetime";
import { WeatherResponseSchema } from "@/lib/opendata/schemas/weather";
import type { WeatherResponse } from "@/lib/opendata/schemas/weather";
import { cachedFetchJson } from "@/lib/client-cache";
import { WEATHER_CACHE } from "@/config/cache";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

// Open-Meteo emits sunrise/sunset as "YYYY-MM-DDTHH:mm" without a tz suffix
// (timezone=Asia/Tokyo means values are already local). Trim the date portion
// for display.
function formatTimeOfDay(iso: string | undefined): string | null {
  if (!iso) return null;
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : null;
}

// Round wind speed to one decimal for display.
function fmtNum(v: number | null | undefined, digits = 0): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

type State =
  | { status: "loading" }
  | { status: "success"; data: WeatherResponse; fetchedAt: Date }
  | { status: "error" };

export default function WeatherPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void cachedFetchJson<WeatherResponse>(
      "weather:v1",
      "/api/weather",
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

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <BackToHome />
      <div className="flex items-start justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-700">
          <KanjiText text="天気（江東区）" />
        </h1>
        <ShareButton title="天気（江東区）" url={`${SITE_URL}/weather`} />
      </div>

      {state.status === "loading" && (
        <p className="text-gray-500">読み込み中…</p>
      )}

      {state.status === "error" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-700">
          <KanjiText text="天気情報を取得できませんでした。しばらく後でお試しください。" />
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-6">
          <JmaWarningPanel />
          <JmaQuakePanel />

          <div>
            <DataFreshness lastModified={state.fetchedAt} label="取得日時" />
          </div>

          {state.data.hourly?.relative_humidity_2m && (
            <section className="rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                <KanjiText text="現在の湿度" />
              </h2>
              <p className="text-sm text-gray-700">
                {(() => {
                  const hourly = state.data.hourly!;
                  const now = state.fetchedAt.getTime();
                  let bestIdx = 0;
                  let bestDelta = Number.POSITIVE_INFINITY;
                  for (let j = 0; j < hourly.time.length; j += 1) {
                    const t = new Date(`${hourly.time[j]}+09:00`).getTime();
                    if (Number.isNaN(t)) continue;
                    const delta = Math.abs(t - now);
                    if (delta < bestDelta) {
                      bestDelta = delta;
                      bestIdx = j;
                    }
                  }
                  const humidity = hourly.relative_humidity_2m?.[bestIdx];
                  const apparent = hourly.apparent_temperature?.[bestIdx];
                  return (
                    <>
                      {humidity != null ? `${humidity}%` : "—"}
                      {apparent != null && (
                        <span className="ml-3 text-xs text-gray-400">
                          <KanjiText text="体感" /> {fmtNum(apparent, 0)}°C
                        </span>
                      )}
                    </>
                  );
                })()}
              </p>
            </section>
          )}

          {state.data.daily ? (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">
                <KanjiText text="今日・明日の予報" />
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {state.data.daily.time.slice(0, 2).map((date, i) => {
                  const daily = state.data.daily!;
                  const maxTemp = daily.temperature_2m_max[i];
                  const minTemp = daily.temperature_2m_min[i];
                  const apparentMax = daily.apparent_temperature_max?.[i];
                  const apparentMin = daily.apparent_temperature_min?.[i];
                  const precip = daily.precipitation_probability_max?.[i];
                  const precipSum = daily.precipitation_sum?.[i];
                  const uv = daily.uv_index_max?.[i];
                  const sunrise = formatTimeOfDay(daily.sunrise?.[i]);
                  const sunset = formatTimeOfDay(daily.sunset?.[i]);
                  const windMax = daily.wind_speed_10m_max?.[i];
                  const windGusts = daily.wind_gusts_10m_max?.[i];
                  const label = i === 0 ? "今日" : "明日";
                  return (
                    <div
                      key={date}
                      className="rounded-lg border border-gray-200 p-4"
                    >
                      <div className="font-semibold text-gray-700 mb-2 flex items-baseline gap-2 flex-wrap">
                        <span>{label}</span>
                        <span className="text-sm font-normal text-gray-500">
                          {formatDayWithWeekday(
                            new Date(`${date}T00:00:00+09:00`),
                          )}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt className="text-gray-500">
                          <KanjiText text="最高気温" />
                        </dt>
                        <dd className="font-medium text-red-600">
                          {maxTemp != null ? `${maxTemp}°C` : "—"}
                          {apparentMax != null && (
                            <span className="ml-2 text-xs text-gray-400 font-normal">
                              <KanjiText text="体感" /> {fmtNum(apparentMax, 0)}°C
                            </span>
                          )}
                        </dd>
                        <dt className="text-gray-500">
                          <KanjiText text="最低気温" />
                        </dt>
                        <dd className="font-medium text-blue-600">
                          {minTemp != null ? `${minTemp}°C` : "—"}
                          {apparentMin != null && (
                            <span className="ml-2 text-xs text-gray-400 font-normal">
                              <KanjiText text="体感" /> {fmtNum(apparentMin, 0)}°C
                            </span>
                          )}
                        </dd>
                        <dt className="text-gray-500">
                          <KanjiText text="降水確率" />
                        </dt>
                        <dd className="font-medium">
                          {precip != null ? `${precip}%` : "—"}
                          {precipSum != null && precipSum > 0 && (
                            <span className="ml-2 text-xs text-gray-400 font-normal">
                              ({fmtNum(precipSum, 1)}mm)
                            </span>
                          )}
                        </dd>
                        {uv != null && (
                          <>
                            <dt className="text-gray-500">UV</dt>
                            <dd className="font-medium">{fmtNum(uv, 0)}</dd>
                          </>
                        )}
                        {(windMax != null || windGusts != null) && (
                          <>
                            <dt className="text-gray-500">
                              <KanjiText text="風" />
                            </dt>
                            <dd className="font-medium">
                              {windMax != null ? `${fmtNum(windMax, 1)}m/s` : "—"}
                              {windGusts != null && (
                                <span className="ml-1 text-xs text-gray-400 font-normal">
                                  (<KanjiText text="瞬間" /> {fmtNum(windGusts, 1)}m/s)
                                </span>
                              )}
                            </dd>
                          </>
                        )}
                        {(sunrise || sunset) && (
                          <>
                            <dt className="text-gray-500">
                              <KanjiText text="日の出" /> /{" "}
                              <KanjiText text="日の入" />
                            </dt>
                            <dd className="font-medium tabular-nums">
                              {sunrise ?? "—"} / {sunset ?? "—"}
                            </dd>
                          </>
                        )}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="text-gray-500">
              <KanjiText text="日別予報データなし" />
            </p>
          )}

          <p className="text-xs text-gray-400">
            <KanjiText text="出典:" />{" "}
            <a
              href="https://open-meteo.com"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo
            </a>{" "}
            (CC-BY 4.0) — <KanjiText text="江東区中心" /> (35.6727°N, 139.8175°E)
            の<KanjiText text="予報" />
          </p>

          <WbgtPanel />
        </div>
      )}
    </div>
  );
}
