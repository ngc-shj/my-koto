"use client";

import { useEffect, useState } from "react";
import BackToHome from "@/components/BackToHome";
import DataFreshness from "@/components/DataFreshness";
import ShareButton from "@/components/ShareButton";
import type { WeatherResponse } from "@/lib/opendata/schemas/weather";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "";

type State =
  | { status: "loading" }
  | { status: "success"; data: WeatherResponse; fetchedAt: Date }
  | { status: "error" };

export default function WeatherPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/weather", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as WeatherResponse;
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
        <h1 className="text-2xl font-bold text-slate-700">天気（江東区）</h1>
        <ShareButton title="天気（江東区）" url={`${SITE_URL}/weather`} />
      </div>

      {state.status === "loading" && (
        <p className="text-gray-500">読み込み中…</p>
      )}

      {state.status === "error" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-700">
          天気情報を取得できませんでした。しばらく後でお試しください。
        </div>
      )}

      {state.status === "success" && (
        <div className="space-y-6">
          <div>
            <DataFreshness lastModified={state.fetchedAt} label="取得日時" />
          </div>

          {state.data.daily ? (
            <section>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">当日・翌日の予報</h2>
              <div className="space-y-3">
                {state.data.daily.time.slice(0, 2).map((date, i) => {
                  const daily = state.data.daily!;
                  const maxTemp = daily.temperature_2m_max[i];
                  const minTemp = daily.temperature_2m_min[i];
                  const precip = daily.precipitation_probability_max?.[i];
                  return (
                    <div
                      key={date}
                      className="rounded-lg border border-gray-200 p-4"
                    >
                      <div className="font-semibold text-gray-700 mb-2">{date}</div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <dt className="text-gray-500">最高気温</dt>
                        <dd className="font-medium text-red-600">
                          {maxTemp != null ? `${maxTemp}°C` : "—"}
                        </dd>
                        <dt className="text-gray-500">最低気温</dt>
                        <dd className="font-medium text-blue-600">
                          {minTemp != null ? `${minTemp}°C` : "—"}
                        </dd>
                        <dt className="text-gray-500">降水確率</dt>
                        <dd className="font-medium">
                          {precip != null ? `${precip}%` : "—"}
                        </dd>
                      </dl>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <p className="text-gray-500">日別予報データなし</p>
          )}

          <p className="text-xs text-gray-400">
            出典:{" "}
            <a
              href="https://open-meteo.com"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo
            </a>{" "}
            (CC-BY 4.0) — 江東区中心 (35.6727°N, 139.8175°E) の予報
          </p>

          <p className="text-xs text-gray-400">
            ※ WBGT（暑さ指数）は日次バッチ取得データに含まれます（今後実装予定）
          </p>
        </div>
      )}
    </div>
  );
}
