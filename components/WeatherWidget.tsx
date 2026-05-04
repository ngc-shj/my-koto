"use client";

import { useEffect, useState } from "react";
import DataFreshness from "@/components/DataFreshness";
import type { WeatherResponse } from "@/lib/opendata/schemas/weather";

type State =
  | { status: "loading" }
  | { status: "success"; data: WeatherResponse; fetchedAt: Date }
  | { status: "error" };

export default function WeatherWidget() {
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

  if (state.status === "loading") {
    return (
      <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">
        天気情報を読み込み中…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        天気情報を取得できませんでした。
      </div>
    );
  }

  const { data, fetchedAt } = state;
  const daily = data.daily;

  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
      <h2 className="text-base font-semibold text-blue-800 mb-2">天気（江東区中心）</h2>
      {daily ? (
        <ul className="space-y-1 text-sm text-gray-700">
          {daily.time.slice(0, 2).map((date, i) => (
            <li key={date} className="flex gap-3">
              <span className="font-medium w-20 shrink-0">{date}</span>
              <span>
                {daily.temperature_2m_max[i] != null &&
                daily.temperature_2m_min[i] != null
                  ? `${daily.temperature_2m_min[i]}°C〜${daily.temperature_2m_max[i]}°C`
                  : "—"}
              </span>
              {daily.precipitation_probability_max?.[i] != null && (
                <span className="text-blue-600">
                  降水 {daily.precipitation_probability_max[i]}%
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">予報データなし</p>
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
